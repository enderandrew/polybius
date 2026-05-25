class UniqueIdFactory {
  // Modern ES class field (no JSDoc type comments needed)
  lastId = 0;

  getNewId () {
    return this.lastId++;
  }
}

const uniqueIdFactory = new UniqueIdFactory();
export default uniqueIdFactory;