export const handleError = function(res:any,statusCode:number,err:any){
  res.status(statusCode).send(err.message);
};