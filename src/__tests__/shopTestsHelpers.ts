import { createBagelItem, createSpreadItem } from "@src/controllers/item";
import { createOrder } from "@src/controllers/order";
import { Address, CartInterface, Order } from "@src/interfaces/interfaces";

export const createTempBagelItem = async function(){
  return await createBagelItem(
    2.50,
    1,
    'TestBagelItem',
    'bagel'
  );
};

export const createTempSpreadItem = async function(){
  return await createSpreadItem(
    5.2,
    'TestSpread',
    'spread'
  );
};

export const createTempOrder = async function(
  userID:string,
  cartArg?:CartInterface,
  shippingAddressArg?:Address
):Promise<Order>{
  const cart:CartInterface = {
    items: [],
    subtotalInDollars: 0,
    taxInDollars: 0,
    totalQuantity: 0,
    promoCodeID: '',
    discountAmountInDollars: 0,
    finalPriceInDollars: 0,
    desiredShipDate: new Date()
  };

  const shippingAddress:Address= {
    line1: 'test',
    city: 'test',
    state: 'test',
    postal_code: 'test',
    country: 'test',
    phone: '123-123-4567',
    fullName: 'test test'
  };
  return await createOrder(
    userID, //fake userID doesnt need to be real
    cartArg || cart,
    shippingAddressArg || shippingAddress,
    undefined
  );
};