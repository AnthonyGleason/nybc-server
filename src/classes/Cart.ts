import { getItemByID } from "@src/controllers/item";
import { BagelItem, CartItem, SpreadItem } from "@src/interfaces/interfaces";

export default class Cart{
  items:CartItem[];
  subtotal:number;
  tax:number;
  totalQuantity:number;
  promoCodeID:string;
  discountAmount:number;
  finalPrice:number;

  constructor(
    cartItems?:CartItem[],
    subtotal?:number,
    tax?:number,
    promoCodeID?:string,
    discountAmount?:number,
    finalPrice?:number
  ){
    this.items = cartItems || [];
    this.subtotal = subtotal || 0;
    this.tax = tax || 0;
    this.totalQuantity = 0;
    this.promoCodeID = promoCodeID || ''; 
    this.discountAmount = discountAmount || 0;
    this.finalPrice = finalPrice || 0;
  };

  applyPromoPerk = (perk:string):void=>{
    switch(perk){
      case '25_PERCENT_OFF':
        for (let cartItem of this.items){
          cartItem.unitPrice = cartItem.unitPrice - (cartItem.unitPrice * 0.25);
        };
        break;
      default:
        console.log('promo code not handled',perk);
    };
  };

  getPromoCodeDiscountMultiplier = (perk:string):number=>{
    switch(perk){
      case '25_PERCENT_OFF':
        return 0.25;
      default:
        console.log('promo code not handled',perk);
        return 0; //RETURN NO DISCOUNT, if you return 1 the customer gets 100% off
    };
  };

  calcPromoCodeDiscountAmount = (perk:string):number =>{
    let discountAmount:number = 0;
    for (let cartItem of this.items){
      discountAmount += ((cartItem.unitPrice * cartItem.quantity) * this.getPromoCodeDiscountMultiplier(perk));
    };
    this.discountAmount = discountAmount;
    return discountAmount;
  };

  calcTotalQuantity = ():number=>{
    let totalQuantity:number = 0;
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
      totalPrice += cartItem.unitPrice * cartItem.quantity;
    });
    this.subtotal = totalPrice;
    return totalPrice;
  };

  calcFinalPrice = ():number=>{
    let finalPrice:number = this.subtotal - this.discountAmount + this.tax;
    this.finalPrice = finalPrice;
    return finalPrice;
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
      if (cartItem.itemData.cat==='bagel' && cartItem.selection === 'six') {
        const tempItemData:BagelItem = cartItem.itemData as BagelItem;
        cartItem.unitPrice = tempItemData.sixPrice - (tempItemData.sixPrice * discountMultiplier);
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
      };
    };    
    return foundIndex;
  };

  verifyUnitPrices = async () =>{
    const promises: Promise<BagelItem | SpreadItem | undefined>[] = this.items.map(async (cartItem) => {
      if (cartItem.itemData.cat === 'bagel' && cartItem.selection === 'six') {
        return getItemByID(cartItem.itemData._id) as Promise<BagelItem>;
      } else if (cartItem.itemData.cat === 'bagel' && cartItem.selection === 'dozen') {
        return getItemByID(cartItem.itemData._id) as Promise<BagelItem>;
      } else if (cartItem.itemData.cat === 'spread') {
        return getItemByID(cartItem.itemData._id) as Promise<SpreadItem>;
      }
      return Promise.resolve(undefined);
    });
    
    const itemDataArray: (BagelItem | SpreadItem | undefined)[] = await Promise.all(promises);

    // Now that we have all the itemData, you can update cartItem.unitPrice here.
    this.items.forEach((cartItem, index) => {
      if (itemDataArray[index]) {
        const itemData = itemDataArray[index];
        if (itemData===undefined) return;
        if (
          cartItem.itemData.cat === 'bagel' &&
          cartItem.selection === 'six'
        ) {
          const tempItemData = itemData as BagelItem;
          cartItem.unitPrice = tempItemData.sixPrice;
        } 
        else if (
          cartItem.itemData.cat === 'bagel' && 
          cartItem.selection === 'dozen'
        ) {
          const tempItemData = itemData as BagelItem;
          cartItem.unitPrice = tempItemData.dozenPrice;
        } 
        else if (
          cartItem.itemData.cat === 'spread'
        ) {
          const tempItemData = itemData as SpreadItem;
          cartItem.unitPrice = tempItemData.price;
        }
      }
    });
  };

  handleModifyCart = (itemDoc:BagelItem | SpreadItem, updatedQuantity:number, selection?:string)=>{
    const itemIndex:number | null = this.getIndexOfItem(itemDoc.name , selection || undefined);
    if (itemIndex === null && updatedQuantity>0) {
      // Item is not in the user's cart; add it with the given quantity
      let unitPrice:number = 0;
      if (itemDoc.cat==='bagel' && selection==='six'){
        const tempItemDoc:BagelItem = itemDoc as BagelItem;
        unitPrice = tempItemDoc.sixPrice;
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
      if (this.items[itemIndex].quantity <=0) this.removeItemFromCart(itemIndex);
    };
  };
};