import { ItemModel } from "@src/models/Item"
import {Item} from '../interfaces/interfaces';

//get shop item by name
export const getItemByName = async function(itemName:string):Promise<Item | null>{
  return await ItemModel.findOne({name: itemName});
};

//get shop item by id
export const getItemByID = async function(itemID:string):Promise<Item | null>{
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
//get all items
export const getAllItems = async function():Promise<Item[] | null>{
  return await ItemModel.find({});
};
//get item by identifier
export const getItemByIdentifier = async function(identifier:string):Promise<Item | null>{
  return await ItemModel.findOne({identifier: identifier})
};

//delete a shop item by ID
export const deleteItemByID = async function(itemID:string):Promise<Item | null>{
  return await ItemModel.findByIdAndDelete(itemID);
};

//delete a shop item by name
export const deleteItemByName = async function(itemName:string):Promise<Item | null>{
  return await ItemModel.findOneAndDelete({name: itemName});
};

//update a shop item by ID
export const updateItemByID = async function(updatedItem:Item,itemID:string):Promise<Item | null>{
  return await ItemModel.findByIdAndUpdate(itemID,updatedItem);
};

//update a shop item by name
export const updateItemByName = async function(updatedItem:Item,itemName:string):Promise<Item | null>{
  return await ItemModel.findOneAndUpdate({name: itemName},updatedItem)
}