const { Client, GatewayIntentBits, EmbedBuilder, Partials, PermissionsBitField, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { config } = require('dotenv');
const fs = require('fs');
const path = require('path');

// Charger les variables d'environnement
config();

// Vérifier que les variables sont bien définies
if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    console.error('Veuillez vérifier votre fichier .env. Les variables TOKEN, CLIENT_ID et GUILD_ID sont requises.');
    process.exit(1);
}

// Initialiser le client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates, // Pour les salons vocaux
    ],
    partials: [Partials.Channel]
});

// Stockage des salons configurés
let channels = {
    bienvenue: null,
    messageTicket: null,
    categorieTicket: null,
    ticketFerme: null,
    vocalTemporaire: null, // Salon vocal temporaire
};

// Message de bienvenue personnalisé
let welcomeMessage = "Bienvenue %membre% sur le serveur ! Vous êtes le membre numéro %membrecount%.";

// Définir les commandes slash
const commands = [
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('Définir les salons pour le système de tickets et vocaux')
        .addChannelOption(option =>
            option.setName('channelbvn')
                .setDescription('Salon de bienvenue')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channelmessageticket')
                .setDescription('Salon pour le message de ticket')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channeticket')
                .setDescription('Catégorie pour les tickets')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channelticketfermer')
                .setDescription('Catégorie pour les tickets fermés')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('vocaltemporaire')
                .setDescription('Salon vocal pour créer des salons temporaires')
                .setRequired(false))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('messagebvn')
        .setDescription('Définir le message de bienvenue')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message de bienvenue (utilisez %membre% et %membrecount%)')
                .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('message')
        .setDescription('Envoyer un message personnalisé')
        .addStringOption(option =>
            option.setName('titre_embed')
                .setDescription('Titre de l\'embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('contenu')
                .setDescription('Contenu de l\'embed')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Salon où envoyer le message')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('couleur')
                .setDescription('Couleur de l\'embed (ex: #FF0000)')
                .setRequired(false))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('giveawaycreate')
        .setDescription('Créer un giveaway')
        .addStringOption(option =>
            option.setName('durée')
                .setDescription('Durée du giveaway (ex: 1d, 2h, 30m)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('récompense')
                .setDescription('Récompense du giveaway')
                .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Afficher les commandes disponibles')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('vocal')
        .setDescription('Déplacer le bot dans un salon vocal et jouer de la musique')
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon vocal où déplacer le bot')
                .setRequired(true))
        .toJSON(),
];

// Supprimer les commandes globales
(async () => {
    try {
        console.log('Suppression des commandes slash globales...');

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        const existingCommands = await rest.get(
            Routes.applicationCommands(process.env.CLIENT_ID) // Récupérer les commandes globales
        );

        for (const command of existingCommands) {
            await rest.delete(
                Routes.applicationCommand(process.env.CLIENT_ID, command.id) // Supprimer chaque commande globale
            );
            console.log(`Commande globale supprimée : ${command.name}`);
        }

        console.log('Commandes globales supprimées avec succès.');
    } catch (error) {
        console.error('Erreur lors de la suppression des commandes globales :', error);
    }
})();

// Enregistrer les commandes pour un serveur spécifique
(async () => {
    try {
        console.log('Enregistrement des commandes slash pour le serveur spécifique...');

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), // Utilisez GUILD_ID ici
            { body: commands },
        );

        console.log('Commandes slash enregistrées avec succès pour le serveur spécifique.');
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement des commandes :', error);
    }
})();

// Gestion des interactions (commandes slash)
client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const { commandName, options, guild, member } = interaction;

        // Vérification des permissions administrateur
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande.", ephemeral: true });
        }

        // 📌 Commande /setchannel
        if (commandName === 'setchannel') {
            const channelBvn = options.getChannel('channelbvn');
            const channelMessageTicket = options.getChannel('channelmessageticket');
            const channelTicket = options.getChannel('channeticket');
            const channelTicketFerme = options.getChannel('channelticketfermer');
            const vocalTemporaire = options.getChannel('vocaltemporaire');

            if (channelBvn) channels.bienvenue = channelBvn.id;
            if (channelMessageTicket) channels.messageTicket = channelMessageTicket.id;
            if (channelTicket) channels.categorieTicket = channelTicket.id;
            if (channelTicketFerme) channels.ticketFerme = channelTicketFerme.id;
            if (vocalTemporaire) channels.vocalTemporaire = vocalTemporaire.id;

            await interaction.reply({ content: 'Salons configurés avec succès !', ephemeral: true });

            if (channelMessageTicket) {
                const embed = new EmbedBuilder()
                    .setTitle('🎫 Système de Tickets')
                    .setDescription('Cliquez sur le bouton ci-dessous pour ouvrir un ticket.')
                    .setColor('Blue');

                const button = new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('Ouvrir un Ticket')
                    .setStyle(ButtonStyle.Primary);

                await channelMessageTicket.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
            }
        }

        // 📌 Commande /messagebvn
        else if (commandName === 'messagebvn') {
            const message = options.getString('message');
            welcomeMessage = message; // Mettre à jour le message de bienvenue

            await interaction.reply({ content: "Message de bienvenue mis à jour avec succès !", ephemeral: true });
        }

        // 📌 Commande /message
        else if (commandName === 'message') {
            const title = options.getString('titre_embed') || 'Titre par défaut';
            const content = options.getString('contenu') || 'Contenu par défaut';
            const targetChannel = options.getChannel('channel') || interaction.channel;
            const couleur = options.getString('couleur') || '#0000FF'; // Couleur par défaut : bleu

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(content)
                .setColor(couleur);

            await targetChannel.send({ embeds: [embed] });
            await interaction.reply({ content: "Message envoyé !", ephemeral: true });
        }

        // 📌 Commande /giveawaycreate
        else if (commandName === 'giveawaycreate') {
            const duration = options.getString('durée');
            const prize = options.getString('récompense');

            const embed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway - ${prize}`)
                .setDescription(`Réagissez pour participer !\nDurée : ${duration}`)
                .setColor('Gold');

            const msg = await interaction.channel.send({ embeds: [embed] });
            await msg.react('🎉');

            setTimeout(async () => {
                try {
                    const fetchedMsg = await interaction.channel.messages.fetch(msg.id);
                    if (!fetchedMsg) return interaction.channel.send("Le message du giveaway a été supprimé.");

                    const reactions = fetchedMsg.reactions.cache.get('🎉');
                    if (!reactions || reactions.count <= 1) {
                        return interaction.channel.send("Personne n'a participé au giveaway !");
                    }

                    const users = await reactions.users.fetch();
                    const winner = users.filter(user => !user.bot).random();
                    interaction.channel.send(`🎉 Félicitations ${winner}, tu as gagné **${prize}** !`);
                } catch (error) {
                    console.error('Erreur lors du tirage au sort :', error);
                }
            }, ms(duration));

            await interaction.reply({ content: "Giveaway créé avec succès !", ephemeral: true });
        }

        // 📌 Commande /info
        else if (commandName === 'info') {
            const embed = new EmbedBuilder()
                .setTitle('📜 Commandes du Bot')
                .setDescription('/setchannel, /messagebvn, /message, /giveawaycreate, /info, /vocal')
                .setColor('Blue');

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // 📌 Commande /vocal
        else if (commandName === 'vocal') {
            const channel = options.getChannel('salon');

            if (channel.type !== ChannelType.GuildVoice) {
                return interaction.reply({ content: "Veuillez spécifier un salon vocal valide.", ephemeral: true });
            }

            // Rejoindre le salon vocal
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
            });

            // Jouer de la musique doucement
            const player = createAudioPlayer();
            const resource = createAudioResource(path.join(__dirname, 'musique.mp3'), {
                volume: 0.2, // Volume à 20%
            });

            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                player.play(resource); // Rejouer la musique en boucle
            });

            await interaction.reply({ content: `Le bot a rejoint ${channel.name} et joue de la musique.`, ephemeral: true });
        }
    } catch (error) {
        console.error('Erreur lors de la gestion de l\'interaction :', error);
        await interaction.reply({ content: 'Une erreur s\'est produite.', ephemeral: true });
    }
});

// 📌 Système de bienvenue
client.on('guildMemberAdd', member => {
    if (!channels.bienvenue) return;

    const bienvenueChannel = member.guild.channels.cache.get(channels.bienvenue);
    if (!bienvenueChannel) return;

    // Remplacer les variables dans le message
    const message = welcomeMessage
        .replace('%membre%', member.toString())
        .replace('%membrecount%', member.guild.memberCount.toString());

    const embed = new EmbedBuilder()
        .setTitle('Bienvenue !')
        .setDescription(message)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor('Green');

    bienvenueChannel.send({ embeds: [embed] });
});

// 📌 Système de tickets
client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isButton()) return;

        if (interaction.customId === 'open_ticket') {
            const category = interaction.guild.channels.cache.get(channels.categorieTicket);
            if (!category) return interaction.reply({ content: "Catégorie de tickets introuvable.", ephemeral: true });

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle('🎫 Ticket ouvert')
                .setDescription('Un membre du staff vous répondra bientôt.')
                .setColor('Blue');

            const closeButton = new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Fermer')
                .setStyle(ButtonStyle.Danger);

            await ticketChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(closeButton)] });
            interaction.reply({ content: `Ticket créé : ${ticketChannel}`, ephemeral: true });
        } else if (interaction.customId === 'close_ticket') {
            const closedCategory = interaction.guild.channels.cache.get(channels.ticketFerme);
            if (!closedCategory) return interaction.reply({ content: "Catégorie des tickets fermés introuvable.", ephemeral: true });

            await interaction.channel.setParent(closedCategory.id);
            await interaction.channel.permissionOverwrites.delete(interaction.user.id); // Révoquer les permissions de l'utilisateur
            interaction.reply({ content: "Ticket fermé.", ephemeral: true });
        }
    } catch (error) {
        console.error('Erreur lors de la gestion du ticket :', error);
        await interaction.reply({ content: 'Une erreur s\'est produite.', ephemeral: true });
    }
});

// Démarrer le bot
client.login(process.env.TOKEN);
