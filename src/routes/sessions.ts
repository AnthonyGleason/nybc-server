import {Router} from 'express';

const sessionsRouter = Router();

//create a new browsing session for guests and users (jwt token)
sessionsRouter.get('/new',(req,res,next)=>{

});

//get current cart contents (jwt token)
sessionsRouter.get('/cart',(req,res,next)=>{

});

//add item to cart (jwt token)
sessionsRouter.post('/cart',(req,res,next)=>{

});

//remove item from cart (jwt token)
sessionsRouter.delete('/cart',(req,res,next)=>{

});

export default sessionsRouter;