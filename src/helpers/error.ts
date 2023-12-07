export const handleError = function(res:any,statusCode:number,err:any){
  console.log('error',err);
  res.status(statusCode).send(err.message);
};