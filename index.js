const http = require('http');
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    PermissionsBitField
} = require('discord.js');

// Dummy HTTP server to keep Render Web Service active
http.createServer((req, res) => {
    res.write("PHOTOCOPIA BOT is running!");
    res.end();
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Store POTW votes in memory: { [messageId]: { [userId]: selectedOption } }
const activeVotes = new Map();

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Register slash commands globally (/vote and /endvote)
    const commands = [
        new SlashCommandBuilder()
            .setName('vote')
            .setDescription('Start a POTW voting session')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of vote')
                    .setRequired(true)
                    .addChoices(
                        { name: 'POTW', value: 'POTW' }
                    )
            ),
        new SlashCommandBuilder()
            .setName('endvote')
            .setDescription('End the POTW vote and publish the winner to announcements')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('The announcements channel to post the winner')
                    .setRequired(true)
            )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Run !setup-roles in your #pick-your-roles channel
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!setup-roles') {
        const embed = new EmbedBuilder()
            .setTitle('📷 Pick Your Photography Roles')
            .setDescription('Click a button below to get your role and unlock posting access to your channel!')
            .setColor(0x3498db);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('role_dslr')
                .setLabel('DSLR / Mirrorless')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('role_featured')
                .setLabel('Featured Photographer')
                .setStyle(ButtonStyle.Success)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('role_mobile')
                .setLabel('Mobile Shooter')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('role_film')
                .setLabel('Film / Analog')
                .setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [embed], components: [row1, row2] });
    }
});

// Map Button Custom IDs to your actual Discord Server Role IDs
const ROLE_MAP = {
    'role_dslr': '1547618209664999475',
    'role_featured': '1547617975778025562',
    'role_mobile': '1547618680077291571',
    'role_film': '1547618880229351535'
};

client.on('interactionCreate', async (interaction) => {
    try {
        // Helper role checks for leadership
        const allowedRoles = ['founder', 'owner', 'co-owner'];
        const hasAllowedRole = interaction.member.roles.cache.some(role => 
            allowedRoles.some(name => role.name.toLowerCase().includes(name))
        );
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        // 1. Handle Slash Commands (/vote and /endvote)
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'vote') {
                const voteType = interaction.options.getString('type');

                if (voteType === 'POTW') {
                    if (!hasAllowedRole && !isAdmin) {
                        return interaction.reply({ 
                            content: '❌ You do not have permission to start a POTW vote! Only Founders, Owners, and Co-Owners can use this.', 
                            ephemeral: true 
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🌟 Photo of the Week (POTW) Voting!')
                        .setDescription('Scroll up in this channel to view the 7 submitted images. Select your favorite photo from the dropdown menu below!\n\n*Your vote is completely hidden.*')
                        .setColor('#FFD700')
                        .setFooter({ text: 'Voting is now open!' });

                    const row = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('potw_vote_select')
                            .setPlaceholder('Choose your favorite photo (1-7)...')
                            .addOptions([
                                { label: 'Photo 1', value: 'photo_1', emoji: '1️⃣' },
                                { label: 'Photo 2', value: 'photo_2', emoji: '2️⃣' },
                                { label: 'Photo 3', value: 'photo_3', emoji: '3️⃣' },
                                { label: 'Photo 4', value: 'photo_4', emoji: '4️⃣' },
                                { label: 'Photo 5', value: 'photo_5', emoji: '5️⃣' },
                                { label: 'Photo 6', value: 'photo_6', emoji: '6️⃣' },
                                { label: 'Photo 7', value: 'photo_7', emoji: '7️⃣' },
                            ])
                    );

                    const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
                    activeVotes.set(message.id, {});
                }
            } 
            else if (interaction.commandName === 'endvote') {
                if (!hasAllowedRole && !isAdmin) {
                    return interaction.reply({ 
                        content: '❌ You do not have permission to end a POTW vote!', 
                        ephemeral: true 
                    });
                }

                if (activeVotes.size === 0) {
                    return interaction.reply({ content: '❌ There are no active voting sessions running right now.', ephemeral: true });
                }

                const [messageId, votes] = Array.from(activeVotes.entries()).pop();
                const targetChannel = interaction.options.getChannel('channel');

                const tally = {};
                Object.values(votes).forEach(choice => {
                    tally[choice] = (tally[choice] || 0) + 1;
                });

                let winner = 'No votes cast';
                let maxVotes = 0;
                for (const [photo, count] of Object.entries(tally)) {
                    if (count > maxVotes) {
                        maxVotes = count;
                        winner = photo;
                    }
                }

                const winnerFormatted = winner !== 'No votes cast' ? winner.replace('_', ' ').toUpperCase() : 'No Winner';

                const winnerEmbed = new EmbedBuilder()
                    .setTitle('🏆 Photo of the Week (POTW) Winner!')
                    .setDescription(`Voting has officially closed! The community has spoken, and the winner is **${winnerFormatted}** with a total of **${maxVotes}** secure votes! 🎉\n\nCheck out `#photo-of-the-week` to view the winning shot.`)
                    .setColor('#00FF00')
                    .setTimestamp();

                await targetChannel.send({ embeds: [winnerEmbed] });

                activeVotes.delete(messageId);

                await interaction.reply({ content: `✅ Voting ended successfully! Results have been posted to ${targetChannel}.`, ephemeral: true });
            }
        }

        // 2. Handle Button Interactions (Role Picker)
        if (interaction.isButton()) {
            const roleId = ROLE_MAP[interaction.customId];
            if (!roleId) return;

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) {
                return interaction.reply({ content: 'Role ID not found. Please check your config.', ephemeral: true });
            }

            const member = interaction.member;

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                await interaction.reply({ content: `Removed **${role.name}** role!`, ephemeral: true });
            } else {
                await member.roles.add(roleId);
                await interaction.reply({ content: `Granted **${role.name}** role! You can now send messages in your dedicated channel.`, ephemeral: true });
            }
        }

        // 3. Handle Select Menu Interactions (POTW Voting)
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'potw_vote_select') {
                const messageId = interaction.message.id;
                const userId = interaction.user.id;
                const choice = interaction.values[0];

                if (!activeVotes.has(messageId)) {
                    activeVotes.set(messageId, {});
                }

                const voteSession = activeVotes.get(messageId);

                if (voteSession[userId]) {
                    return interaction.reply({ 
                        content: '❌ You have already cast your vote for this session! Votes cannot be changed.', 
                        ephemeral: true 
                    });
                }

                voteSession[userId] = choice;

                return interaction.reply({ 
                    content: `✅ Your vote for **${choice.replace('_', ' ').toUpperCase()}** has been successfully recorded securely!`, 
                    ephemeral: true 
                });
            }
        }

    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Could not process action. Ensure my Bot Role is higher than the roles it assigns!', ephemeral: true }).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
