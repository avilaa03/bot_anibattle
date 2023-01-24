const thisDeveloper = require("../../utils/PermissionsUtils");

module.exports = class CommandUtils {
  static parseOptions(options = {}) {
    return {
      devNeed: !!options.devNeed,
    };
  }

  static util({ client, author }, opts = {}) {
    const options = this.parseOptions(opts);

    if (options.devNeed && !thisDeveloper(client, author.id)) {
      throw new Error(`DEVELOPERS`);
    }
  }
};
