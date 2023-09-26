import {Item} from '../interfaces/interfaces';

export default class Cart{
  items:Item[];

  constructor(items?:Item[]){
    this.items = items || [];
  };

  handleModifyCart = (itemDoc: Item, quantity: number): void => {
    const itemIndex: number | undefined = this.getIndexOfItemByName(itemDoc.name);
    if (itemIndex === undefined && quantity>0) {
      // Item is not in the user's cart; add it with the given quantity
      this.items.push({ 
        name: itemDoc.name,
        quantity: quantity,
        price: itemDoc.price,
        _id: itemDoc._id.toString() // converts the itemID to string so it doesnt show as Object("id")
      })
    }else if (itemIndex!==undefined){
      // Item already exists in the user's cart, update the quantity
      const item = this.items[itemIndex];
      item.quantity = quantity;
      // If the new item quantity is less than or equal to 0, remove that item
      if (item.quantity <= 0) {
        this.removeItemFromCart(item.name);
      };
    };
  };

  getIndexOfItemByName = (itemName: string): number | undefined => {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].name === itemName) {
        return i;
      };
    };
    return undefined;
  };

  removeItemFromCart = (itemName: string): void => {
    const itemIndex: number | undefined = this.getIndexOfItemByName(itemName);

    if (itemIndex !== undefined) {
      this.items.splice(itemIndex, 1);
    };
  };
};