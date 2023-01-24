module.exports = class Ready {
  constructor(client) {
    this.client = client;
  }

  async ON() {
    await this.client.user.setActivity("Bot feito em JavaScript", {
      type: "PLAYING",
    });

    await this.client.user.setStatus("idle");
  }
};
