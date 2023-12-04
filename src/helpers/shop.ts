import { CartItem } from "@src/interfaces/interfaces";

export const getSelectionName = function(cartItem:CartItem){
  if (cartItem.selection==='six') return 'Six Pack(s)';
  if (cartItem.selection==='dozen') return 'Dozen(s)';
  if (cartItem.itemData.cat==='spread') return 'One Pound';
};