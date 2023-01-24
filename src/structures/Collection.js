module.exports = class Collection {
  constructor() {
    this.collection = [];
  }

  push(value) {
    return this.collection.push(value);
  }

  paginate(page_number, page_size) {
    return this.collection.slice(
      (page_number - 1) * page_size,
      page_number * page_size
    );
  }

  length() {
    return this.collection.length;
  }
};
