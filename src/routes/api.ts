import { Router } from 'express';
import usersRouter from './users';
import { shopRouter } from './shop';
import adminRouter from './admin';
import membershipsRouter from './memberships';

const apiRouter = Router();

apiRouter.get('/',(req,res,next)=>{
  res.json({'message': "You have successfully connected to the Brendel's Webstore API"});
})

apiRouter.use('/users',usersRouter);
apiRouter.use('/shop',shopRouter);
apiRouter.use('/admin',adminRouter);
apiRouter.use('/memberships',membershipsRouter);

// **** Export default **** //

export default apiRouter;