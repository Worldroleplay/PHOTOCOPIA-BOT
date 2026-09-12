const http = require('http');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

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

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
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
    if (!interaction.isButton()) return;

    const roleId = ROLE_MAP[interaction.customId];
    if (!roleId) return;

    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
        return interaction.reply({ content: 'Role ID not found. Please check your config.', ephemeral: true });
    }

    const member = interaction.member;

    try {
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            await interaction.reply({ content: `Removed **${role.name}** role!`, ephemeral: true });
        } else {
            await member.roles.add(roleId);
            await interaction.reply({ content: `Granted **${role.name}** role! You can now send messages in your dedicated channel.`, ephemeral: true });
        }
    } catch (err) {
        console.error(err);
        await interaction.reply({ content: 'Could not update role. Ensure my Bot Role is higher than the roles it assigns!', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
