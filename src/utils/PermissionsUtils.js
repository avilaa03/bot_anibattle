const thisDeveloper = (client, author) => {
  return client.developers.includes(author);
};

module.exports = thisDeveloper;
