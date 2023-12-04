export const handleError = function(res:any,statusCode:number,err:any){
  console.log('error',err);
  console.log('err message',err.message);
  res.status(statusCode).send(err.message);
};