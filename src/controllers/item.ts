import { ItemModel } from "@src/models/Item"
import {Item} from '../interfaces/interfaces';

//get shop item by name
export const getItemByName = async function(itemName:string){
  return await ItemModel.findOne({name: itemName});
};

//get shop item by id
export const getItemByID = async function(itemID:string){
  return await ItemModel.findById(itemID);
};

//create a shop item
export const createItem = async function(
  price:number,
  name:string,
){
  return await ItemModel.create({
    price: price,
    name: name
  });
};

//delete a shop item by ID
export const deleteItemByID = async function(itemID:string){
  return await ItemModel.findByIdAndDelete(itemID);
};

//delete a shop item by name
export const deleteItemByName = async function(itemName:string){
  return await ItemModel.findOneAndDelete({name: itemName});
};

//update a shop item by ID
export const updateItemByID = async function(updatedItem:Item,itemID:string){
  return await ItemModel.findByIdAndUpdate(itemID,updatedItem);
};

//update a shop item by name
export const updateItemByName = async function(updatedItem:Item,itemName:string){
  return await ItemModel.findOneAndUpdate({name: itemName},updatedItem)
}