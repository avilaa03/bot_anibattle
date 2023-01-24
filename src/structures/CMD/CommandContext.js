module.exports = class CommandContext {
  constructor(options = {}) {
    this.client = options.client;

    this.command = options.command;
    this.message = options.message;

    this.author = this.message.author;
    this.guild = this.message.guild;

    this.channel = this.message.channel;
  }
};
