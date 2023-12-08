import { CartItem } from "@src/interfaces/interfaces";

export const getSelectionName = function(cartItem:CartItem){
  if (cartItem.itemData.cat==='bagel' && cartItem.selection==='six') return 'Six Pack(s)';
  if (cartItem.itemData.cat==='bagel' && cartItem.selection==='dozen') return 'Dozen(s)';
  if (cartItem.itemData.cat==='spread') return 'One Pound';
  if (cartItem.itemData.cat==='pastry') return 'Six Pack(s)';

  return 'N/A';
};