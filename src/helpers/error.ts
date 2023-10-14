export const handleError = function(res:any,statusCode:number,err:any){
  console.log('An error has occured.',err.message);
  res.status(statusCode).send(err.message);
};