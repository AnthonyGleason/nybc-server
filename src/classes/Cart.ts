import { getItemByID } from "@src/controllers/item";
import { BagelItem, CartItem, SpreadItem } from "@src/interfaces/interfaces";

export default class Cart{
  items:CartItem[];
  subtotal:number;
  tax:number;
  total:number

  constructor(
    cartItems?:CartItem[],
    subtotal?:number,
    tax?:number,
    total?:number,  
  ){
    this.items = cartItems || [];
    this.subtotal = subtotal || 0;
    this.tax = tax || 0;
    this.total = total || 0;
  };

  calcSubtotal = ():number=>{
    let totalPrice:number = 0;
    //verify there are items in the cart
    this.items.forEach((cartItem:CartItem)=>{
      totalPrice += cartItem.unitPrice * cartItem.quantity;
    });
    this.total = totalPrice;
    return totalPrice;
  };

  calcTotal = ():number=>{
    this.total = this.calcSubtotal()+this.tax;
    return this.total;
  };

  isCartEmpty = ():boolean=>{
    //verify there are items in the cart
    if (this.items.length<=0) return true;
    return false;
  };

  applyMembershipPricing = (membershipTier:string)=>{
    //verify there are items in the cart
    if (this.isCartEmpty()) return;
    //reiterate through the cart items
    this.items.forEach((cartItem:CartItem)=>{
      let discountMultiplier:number = 1;
      switch(membershipTier){
        case 'Gold Member':
          discountMultiplier = 0.05;    
          break;
        case 'Platinum Member':
          discountMultiplier = 0.10;
          break;
        case 'Diamond Member':
          discountMultiplier = 0.15;
          break;
        default:
          break;
      };
      //handle applying the discount based on the item type
      if (cartItem.itemData.cat==='bagel' && cartItem.selection === 'four') {
        const tempItemData:BagelItem = cartItem.itemData as BagelItem;
        cartItem.unitPrice = tempItemData.fourPrice - (tempItemData.fourPrice * discountMultiplier);
      } else if (cartItem.itemData.cat === 'bagel' && cartItem.selection === 'dozen') {
        const tempItemData:BagelItem = cartItem.itemData as BagelItem;
        cartItem.unitPrice = tempItemData.dozenPrice - (tempItemData.dozenPrice * discountMultiplier);
      } else if (cartItem.itemData.cat === 'spread') {
        const tempItemData:SpreadItem = cartItem.itemData as SpreadItem;
        cartItem.unitPrice = tempItemData.price - (tempItemData.price * discountMultiplier);
      };
    });
  };

  removeItemFromCart = (itemIndex:number)=>{
    this.items.splice(itemIndex, 1);
  };


  getIndexOfItem = (itemName:string, selection?:string):number | null=>{
    let foundIndex = null;
    for (let index = 0; index < this.items.length; index++) {
      const cartItem: CartItem = this.items[index];
      if (cartItem.itemData.cat === 'bagel') {
        const itemData: BagelItem = cartItem.itemData as BagelItem;
        if (cartItem.selection === selection && itemData.name === itemName) {
          foundIndex = index;
          break; // Exit the loop if the item is found
        };
      } else if (cartItem.itemData.cat === 'spread') {
        const itemData: SpreadItem = cartItem.itemData as SpreadItem;
        if (cartItem.selection === selection && itemData.name === itemName) {
          foundIndex = index;
          break; // Exit the loop if the item is found
        };
      };
    };    
    return foundIndex;
  };

  verifyUnitPrices = async () =>{
    for (let cartItem of this.items){
      if (cartItem.itemData.cat==='bagel' && cartItem.selection === 'four') {
        const tempItemData:BagelItem | null = await getItemByID(cartItem.itemData._id) as BagelItem;
        if (tempItemData) cartItem.unitPrice = tempItemData.fourPrice;
      } else if (cartItem.itemData.cat === 'bagel' && cartItem.selection === 'dozen') {
        const tempItemData:BagelItem | null = await getItemByID(cartItem.itemData._id) as BagelItem;
        if (tempItemData) cartItem.unitPrice = tempItemData.dozenPrice;
      } else if (cartItem.itemData.cat === 'spread') {
        const tempItemData:SpreadItem | null = await getItemByID(cartItem.itemData._id) as SpreadItem;
        if (tempItemData) cartItem.unitPrice = tempItemData.price;
      };
    };
  };

  handleModifyCart = (itemDoc:BagelItem | SpreadItem, updatedQuantity:number, selection?:string)=>{
    const itemIndex:number | null = this.getIndexOfItem(itemDoc.name , selection || undefined);
    if (itemIndex === null && updatedQuantity>0) {
      // Item is not in the user's cart; add it with the given quantity
      let unitPrice:number = 0;
      if (itemDoc.cat==='bagel' && selection==='four'){
        const tempItemDoc:BagelItem = itemDoc as BagelItem;
        unitPrice = tempItemDoc.fourPrice;
      }else if (itemDoc.cat==='bagel' && selection==='dozen'){
        const tempItemDoc:BagelItem = itemDoc as BagelItem;
        unitPrice = tempItemDoc.dozenPrice;
      } else if (itemDoc.cat==='spread'){
        const tempItemDoc:SpreadItem = itemDoc as SpreadItem;
        unitPrice = tempItemDoc.price;
      };
      this.items.push({
        itemData: itemDoc,
        selection: selection || undefined,
        quantity: updatedQuantity,
        unitPrice: unitPrice,
      });
    }else if (itemIndex!==null){
      // Item already exists in the user's cart, update the quantity
      this.items[itemIndex].quantity = updatedQuantity;
      // If the new item quantity is less than or equal to 0, remove that item
      if (this.items[itemIndex].quantity) this.removeItemFromCart(itemIndex);
    };
  };
};