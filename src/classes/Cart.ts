import { getItemByID } from "@src/controllers/item";
import { BagelItem, CartItem, MysteryItem, PastryItem, Product, SpreadItem } from "@src/interfaces/interfaces";

export default class Cart{
  items:CartItem[];
  subtotalInDollars:number;
  taxInDollars:number;
  totalQuantity:number;
  discountAmountInDollars:number;
  finalPriceInDollars:number;
  desiredShipDate:Date;
  isGuest:boolean;
  
  constructor(
    cartItems?:CartItem[],
    subtotalInDollars?:number,
    taxInDollars?:number,
    discountAmountInDollars?:number,
    finalPriceInDollars?:number,
    desiredShipDate?:Date,
    isGuest?:boolean
  ){
    this.items = cartItems || [];
    this.subtotalInDollars = subtotalInDollars || 0;
    this.taxInDollars = taxInDollars || 0;
    this.totalQuantity = 0;
    this.discountAmountInDollars = discountAmountInDollars || 0;
    this.finalPriceInDollars = finalPriceInDollars || 0;
    this.desiredShipDate = desiredShipDate || new Date();
    this.isGuest = isGuest || false;
  };

  calcTotalQuantity = ():number=>{
    let totalQuantity:number = 0;
    //break if cart is empty
    if (!this.items) return totalQuantity;
    this.items.forEach((item:CartItem)=>{
      totalQuantity+=item.quantity;
    });
    this.totalQuantity = totalQuantity;
    return totalQuantity
  };

  calcSubtotal = ():number=>{
    let totalPrice:number = 0;
    //verify there are items in the cart
    this.items.forEach((cartItem:CartItem)=>{
      totalPrice += cartItem.unitPriceInDollars * cartItem.quantity;
    });
    this.subtotalInDollars = totalPrice;
    return totalPrice;
  };

  calcFinalPrice = ():number=>{
    this.finalPriceInDollars = this.subtotalInDollars - this.discountAmountInDollars + this.taxInDollars;
    return this.finalPriceInDollars;
  };

  isCartEmpty = ():boolean=>{
    //verify there are items in the cart
    if (this.items.length<=0) return true;
    return false;
  };

  applyMembershipPricing = (membershipTier:string)=>{
    //verify there are items in the cart
    //If the user is not a member do not continue
    if (this.isCartEmpty() || membershipTier ==='Non-Member') return;
    //reiterate through the cart items
    this.items.forEach((cartItem:CartItem)=>{
      let discountMultiplier:number = 0;
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
      if (cartItem.itemData.cat === 'bagel' && cartItem.selection==='two'){
        const tempItemData:BagelItem = cartItem.itemData as BagelItem;
        cartItem.unitPriceInDollars = tempItemData.twoPrice - (tempItemData.twoPrice * discountMultiplier);
      }else if (cartItem.itemData.cat==='bagel' && cartItem.selection === 'six') {
        const tempItemData:BagelItem = cartItem.itemData as BagelItem;
        cartItem.unitPriceInDollars = tempItemData.sixPrice - (tempItemData.sixPrice * discountMultiplier);
      } else if (cartItem.itemData.cat === 'bagel' && cartItem.selection === 'dozen') {
        const tempItemData:BagelItem = cartItem.itemData as BagelItem;
        cartItem.unitPriceInDollars = tempItemData.dozenPrice - (tempItemData.dozenPrice * discountMultiplier);
      } else if (cartItem.itemData.cat === 'spread') {
        const tempItemData:SpreadItem = cartItem.itemData as SpreadItem;
        cartItem.unitPriceInDollars = tempItemData.price - (tempItemData.price * discountMultiplier);
      }else if (cartItem.itemData.cat === 'pastry'){
        const tempItemData:PastryItem = cartItem.itemData as PastryItem;
        cartItem.unitPriceInDollars = tempItemData.price - (tempItemData.price * discountMultiplier);
      };
    });
  };

  removeItemFromCart = (itemIndex:number)=>{
    this.items.splice(itemIndex, 1);
  };

  cleanupCart = async (membershipTier?:string)=>{
    const tempMembershipTier = membershipTier || 'Non-Member';
    //perform cleanup and verification
    await this.verifyUnitPrices();
    
    this.calcTotalQuantity();
    //reapply discounts to items
    this.applyMembershipPricing(tempMembershipTier);
    //calculate the new subtotal
    this.calcSubtotal();
    //calculate final price
    this.calcFinalPrice();
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
      }else if (cartItem.itemData.cat === 'pastry'){
        const itemData: PastryItem = cartItem.itemData as PastryItem;
        if (cartItem.selection === selection && itemData.name === itemName) {
          foundIndex = index;
          break; // Exit the loop if the item is found
        };
      };
    };    
    return foundIndex;
  };

  getBagelUnitPrice = (selection:string,itemData:BagelItem):number=>{
    switch(selection){
      case 'two':
        return itemData.twoPrice;
      case 'six':
        return itemData.sixPrice;
      case 'dozen':
        return itemData.dozenPrice;
      default:
        return itemData.dozenPrice;
    };
  };

  verifyUnitPrices = async () =>{
    const promises: Promise<Product | undefined>[] = this.items.map(async (cartItem) => {
      if (cartItem.itemData.cat === 'bagel' && (cartItem.selection==='two' || cartItem.selection ==='six'||cartItem.selection==='dozen')) {
        return getItemByID(cartItem.itemData._id) as Promise<BagelItem>;
      } else if (cartItem.itemData.cat === 'spread') {
        return getItemByID(cartItem.itemData._id) as Promise<SpreadItem>;
      } else if (cartItem.itemData.cat === 'pastry') {
        return getItemByID(cartItem.itemData._id) as Promise<PastryItem>;
      }
      return Promise.resolve(undefined);
    });
    
    const itemDataArray: (Product | undefined)[] = await Promise.all(promises);

    // Now that we have all the itemData, you can update cartItem.unitPrice here.
    this.items.forEach((cartItem, index) => {
      if (itemDataArray[index]) {
        const itemData = itemDataArray[index];
        if (itemData===undefined) return;
        if (cartItem.itemData.cat === 'bagel') {
          const tempItemData = itemData as BagelItem;
          cartItem.unitPriceInDollars = this.getBagelUnitPrice(cartItem.selection || '',tempItemData);
        } else if (cartItem.itemData.cat === 'spread') {
          const tempItemData = itemData as SpreadItem;
          cartItem.unitPriceInDollars = tempItemData.price;
        }else if(
          cartItem.itemData.cat ==='pastry'
        ){
          const tempItemData = itemData as PastryItem;
          cartItem.unitPriceInDollars = tempItemData.price;
        };
      };
    });
  };

  handleModifyCart = (itemDoc:Product, updatedQuantity:number, selection?:string)=>{
    const itemIndex:number | null = this.getIndexOfItem(itemDoc.name , selection || undefined);
    if (itemIndex === null && updatedQuantity>0) {
      // Item is not in the user's cart; add it with the given quantity
      let unitPrice:number = 0;
      if (itemDoc.cat==='bagel' && selection){
        const tempItemDoc:BagelItem = itemDoc as BagelItem;
        unitPrice = this.getBagelUnitPrice(selection,tempItemDoc);
      }else if (itemDoc.cat==='spread'){
        const tempItemDoc:SpreadItem = itemDoc as SpreadItem;
        unitPrice = tempItemDoc.price;
      }else if(itemDoc.cat==='pastry'){
        const tempItemDoc:PastryItem = itemDoc as PastryItem;
        unitPrice = tempItemDoc.price;
      }else if(itemDoc.cat==='mystery'){
        const tempItemDoc:MysteryItem = itemDoc as MysteryItem;
        unitPrice = tempItemDoc.price;
      }else{
        throw new Error('The requested selection is invalid.');
      };
      this.items.push({
        itemData: itemDoc,
        selection: selection || undefined,
        quantity: updatedQuantity,
        unitPriceInDollars: unitPrice,
      });
    }else if (itemIndex!==null){
      // Item already exists in the user's cart, update the quantity
      this.items[itemIndex].quantity = updatedQuantity;
      // If the new item quantity is less than or equal to 0, remove that item
      if (this.items[itemIndex].quantity <=0) this.removeItemFromCart(itemIndex);
    };
  };
};