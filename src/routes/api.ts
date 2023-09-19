import { Router } from 'express';
import sessionsRouter from './sessions';
import usersRouter from './users';

const apiRouter = Router();

apiRouter.get('/',(req,res,next)=>{
  res.json({'message': "You have successfully connected to the Brendel's Webstore API"});
})

apiRouter.use('/sessions',sessionsRouter);
apiRouter.use('/users',usersRouter);


// **** Export default **** //

export default apiRouter;
