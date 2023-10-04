import { Router } from 'express';
import usersRouter from './users';
import { shopRouter } from './shop';

const apiRouter = Router();

apiRouter.get('/',(req,res,next)=>{
  res.json({'message': "You have successfully connected to the Brendel's Webstore API"});
})

apiRouter.use('/users',usersRouter);
apiRouter.use('/shop',shopRouter);

// **** Export default **** //

export default apiRouter;