export const handleError = function(res:any,statusCode:number,message:string){
  console.log('An error has occured.',message);
  res.status(statusCode).send(message);
};