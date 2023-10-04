import {Item} from '../interfaces/interfaces';

export default class Cart{
  items:Item[];

  constructor(items?:Item[]){
    this.items = items || [];
  };

  handleModifyCart = (itemDoc: Item, updatedQuantity: number, membershipTier:string): void => {
    const itemIndex: number | undefined = this.getIndexOfItemByName(itemDoc.name);
    //update item price based on membership tier
    let updatedPrice:number = itemDoc.price;
    console.log(updatedPrice);
    switch(membershipTier){
      case 'Gold Member':
        updatedPrice -= (updatedPrice*0.05);
        break;
      case 'Platinum Member':
        updatedPrice -= (updatedPrice*0.10);
        break;
      case 'Diamond Member':
        updatedPrice -= (updatedPrice*0.15);
        break;
      default: //user is a non member
        break
    };
    console.log(updatedPrice);
    if (itemIndex === undefined && updatedQuantity>0) {
      // Item is not in the user's cart; add it with the given quantity
      //creating a new updated item and updating the properties of that does not work it gives NaN error on quantity
      this.items.push({
        name: itemDoc.name,
        price: updatedPrice,
        quantity: updatedQuantity,
        _id: itemDoc._id,
        index: itemDoc.index
      });
    }else if (itemIndex!==undefined){
      // Item already exists in the user's cart, update the quantity
      const item = this.items[itemIndex];
      item.quantity = updatedQuantity;
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