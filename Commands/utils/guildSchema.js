const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Configuração por servidor.
 *
 * Hoje só guarda o idioma, mas existe como coleção própria (em vez de um
 * campo solto em qualquer lugar) porque configuração de servidor tende a
 * crescer — canal de anúncios, cargo de VIP, comandos desligados. Quando
 * isso vier, entra aqui sem migração.
 */
const GuildSchema = new Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // 'pt-BR', 'en-US' ou null. Nulo significa "seguir o idioma do
    // Discord de quem usou o comando" — é o padrão de quem nunca rodou
    // /idioma, e é o que faz um servidor internacional funcionar sem
    // ninguém configurar nada.
    idioma: {
        type: String,
        default: null
    },

    idiomaDefinidoPor: { type: String, default: null },
    idiomaDefinidoEm: { type: Date, default: null }
});

const Guild = mongoose.models.Guild || mongoose.model('Guild', GuildSchema);

module.exports = Guild;
