import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import app from "@src/server";
import supertest from "supertest";

describe('users',()=>{
  //global declarations
  let createUserResponse:any;
  //this is the user credentials used to test the below routes (user is created in beforeAll)
  const USER_FIRST_NAME = 'firstName';
  const USER_LAST_NAME = 'lastName';
  const USER_EMAIL = 'newUser@nybagelsclub.com';
  const USER_PASS = 'password';
  const USER_PASS_CONF = 'password';
  const DELETED_USER_TOKEN = '';
  //creates a demo user for all tests
  beforeAll(async () => {
    // Create user
    const response: any = await supertest(app)
      .post('/api/users/register')
      .send({
        firstName: USER_FIRST_NAME,
        lastName: USER_LAST_NAME,
        email: USER_EMAIL,
        password: USER_PASS,
        passwordConfirm: USER_PASS_CONF
      });
    createUserResponse = response;
  });

  ////////////////////////
  //  Begin testing
  ////////////////////////
  describe('get user data',()=>{
    it('should return unauthorized if a login token is not provided', async()=>{
      const response = await supertest(app)
        .get('/api/users')
        .set({
          'Authorization': `Bearer ${undefined}`
        })
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
    it('should return user data for the provided token', async()=>{
      const response = await supertest(app)
        .get('/api/users')
        .set({
          'Authorization': `Bearer ${createUserResponse.body.token}`
        })
      expect(response.body.user.firstName).toBe(USER_FIRST_NAME);
      expect(response.body.user.lastName).toBe(USER_LAST_NAME);
      expect(response.body.user.email).toBe(USER_EMAIL);
      expect(response.body.user.hashedPassword).toBeDefined();
    });
  })
  describe('register',()=>{
    it('should create a new user', async () => {
      //user is created in beforeAll, we are verifying the doc is correct
      const getUserDataResponse: any = await supertest(app)
        .get('/api/users')
        .set({
          'Authorization': `Bearer ${createUserResponse.body.token}`
        });
      // Verify user data
      expect(getUserDataResponse.body.user.firstName).toBe(USER_FIRST_NAME);
      expect(getUserDataResponse.body.user.lastName).toBe(USER_LAST_NAME);
      expect(getUserDataResponse.body.user.email).toBe(USER_EMAIL);
      expect(getUserDataResponse.body.user.hashedPassword).toBeDefined();
    });
    it('should create a membership doc for the new user', async () => {
      //verify a membership doc was created in the creation of a new user in the before all
      const getUserDataResponse: any = await supertest(app)
        .get('/api/users')
        .set({
          'Authorization': `Bearer ${createUserResponse.body.token}`
        });
      // Verify membership doc
      expect(getUserDataResponse.body.membership).toBeDefined;
    });
    it('should send the user a welcome email', async () => {
      //like the above tests see the before each
      expect(createUserResponse.body.isEmailSent).toBe(true);
    });
    it('should return bad request on missing fields', async () => {
      const missingFields = ['firstName', 'lastName', 'email', 'password', 'passwordConfirm'];
  
      for (const field of missingFields) {
        const userData:any = {
          firstName: USER_FIRST_NAME,
          lastName: USER_LAST_NAME,
          email: USER_EMAIL,
          password: USER_PASS,
          passwordConfirm: USER_PASS_CONF
        };
        userData[field] = undefined;
  
        const response = await supertest(app)
        .post('/api/users/register')
        .send(userData);
        expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      }
    });
    it('should return bad request if passwords do not match', async ()=>{
      const response = await supertest(app)
        .post('/api/users/register')
        .send({
          firstName: USER_FIRST_NAME,
          lastName: USER_LAST_NAME,
          email: USER_EMAIL,
          password: USER_PASS,
          passwordConfirm: 'passwordDoesntMatch'
        });
      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });
    it('should sign a new jwt token for the user', async ()=>{
      //see the before all code for user registration
      expect(createUserResponse.body.token).toBeDefined;
    });
    it('should return a conflict if an account with that email already exists', async ()=>{
      //create user
      const createSecondUserResponse:any = await supertest(app)
        .post('/api/users/register')
        .send({
          firstName: USER_EMAIL,
          lastName: USER_LAST_NAME,
          email: USER_EMAIL,
          password: USER_PASS,
          passwordConfirm: USER_PASS_CONF
        });
      expect(createSecondUserResponse.status).toBe(HttpStatusCodes.CONFLICT);
    });
  });
  describe('login',()=>{
    it('should return bad request if a email was not provided',async()=>{
      const loginResponse = await supertest(app)
        .post('/api/users/login')
        .send({
          email: undefined,
          password: USER_PASS
        });
      expect(loginResponse.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });
    it('should return bad request if a password was not provided', async()=>{
      const loginResponse = await supertest(app)
        .post('/api/users/login')
        .send({
          email: USER_EMAIL,
          password: undefined
        });
      expect(loginResponse.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });
    it('should login a user with the correct credentials and return a jwt token',async()=>{
      const loginUserResponse = await supertest(app)
        .post('/api/users/login')
        .send({
          email: USER_EMAIL,
          password: USER_PASS
        });
      expect(loginUserResponse.status).toBe(HttpStatusCodes.OK);
      expect(loginUserResponse.body.token).toBeDefined;
    });
    it('should return unauthorized if the password is incorrect',async()=>{
      const loginUserResponse = await supertest(app)
        .post('/api/users/login')
        .send({
          email: USER_EMAIL,
          password: 'password(Incorrect)'
        });
      expect(loginUserResponse.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
    it('should return not found if a user does not exist with the provided email', async()=>{
      const loginUserResponse = await supertest(app)
          .post('/api/users/login')
          .send({
            email: 'thisEmailDoesNotExist@nybagelsclub.com',
            password: USER_PASS
          });
        expect(loginUserResponse.status).toBe(HttpStatusCodes.NOT_FOUND);
    });
  });
  describe('logout',()=>{
    it('should invalidate the provided jwt token',async()=>{
      //login in a seperate instance to not effect the global token
      const loginUserResponse = await supertest(app)
        .post('/api/users/login')
        .send({
          email: USER_EMAIL,
          password: USER_PASS
        });
      expect(loginUserResponse.status).toBe(HttpStatusCodes.OK);
      expect(loginUserResponse.body.token).toBeDefined;

      //try to logout the newly created user
      const logoutUserResponse = await supertest(app)
        .post('/api/users/logout')
        .set({
          'Authorization': `Bearer ${loginUserResponse.body.token}`
        });
      expect(logoutUserResponse.body.isLoggedOut).toBe(true);
    });
    it('should return unauthorized if a login token is not provided', async()=>{
      const response = await supertest(app)
        .post('/api/users/logout')
        .set({
          'Authorization': `Bearer ${undefined}`
        })
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
  });
  describe('verify signed in user',()=>{
    it('should return unauthorized if a login token is not provided', async()=>{
      const response = await supertest(app)
        .get('/api/users/verify')
        .set({
          'Authorization': `Bearer ${undefined}`
        })
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
    it('should return ok if user is verified', async()=>{
      const verifyUserResponse = await supertest(app)
        .get('/api/users/verify')
        .set({
          'Authorization': `Bearer ${createUserResponse.body.token}`
        })
      expect(verifyUserResponse.body.isValid).toBe(true);
      expect(verifyUserResponse.status).toBe(HttpStatusCodes.OK);
    });
  });
  describe('get membership level for user',()=>{
    it('should return unauthorized if a login token is not provided', async()=>{
      const response = await supertest(app)
        .get('/api/users/membershipLevel')
        .set({
          'Authorization': `Bearer ${undefined}`
        })
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
    it('should return not found and provide "Non-Member" if a membership level does not exist', async()=>{
      //register a user to not effect the global account
      const registerResponse = await supertest(app)
        .post('/api/users/register')
        .send({
          firstName: 'firstName',
          lastName: 'lastName',
          email: 'newUser99@nybagelsclub.com',
          password: 'password',
          passwordConfirm: 'password'
        });
      expect(registerResponse.status).toBe(HttpStatusCodes.OK);
      //delete the membership doc for the user
      const deleteMembershipDocResponse = await supertest(app)
        .delete('/api/users/membershipLevel')
        .set({
          'Authorization': `Bearer ${registerResponse.body.token}`
        });
      expect(deleteMembershipDocResponse.status).toBe(HttpStatusCodes.OK);
      //get the membership doc data
      const getMembershipDocResponse = await supertest(app)
        .get('/api/users/membershipLevel')
        .set({
          'Authorization': `Bearer ${registerResponse.body.token}`
        });
      expect(getMembershipDocResponse.status).toBe(HttpStatusCodes.NOT_FOUND);
    });
    it('should return ok and provide a membership tier if a membership doc exists', async()=>{
      //get the membership doc data
      const getMembershipDocResponse = await supertest(app)
        .get('/api/users/membershipLevel')
        .set({
          'Authorization': `Bearer ${createUserResponse.body.token}`
        });
      expect(getMembershipDocResponse.status).toBe(HttpStatusCodes.OK);
    });
  });
  describe('forgot password',()=>{
    it('should send a forgot password email', async ()=>{
      //send forgot password email
      const forgotPasswordResponse = await supertest(app)
        .post('/api/users/forgotPassword')
        .send({
          email: USER_EMAIL
        });
      expect(forgotPasswordResponse.status).toBe(HttpStatusCodes.OK);
      expect(forgotPasswordResponse.body.isEmailSent).toBe(true);
    });
    it('should return bad request if a user email was not provided',async()=>{
      const forgotPasswordResponse = await supertest(app)
        .post('/api/users/forgotPassword')
        .send({
          email: undefined
        });
      expect(forgotPasswordResponse.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });
    it('should return not found if a user does not exist with the provided email',async()=>{
      const forgotPasswordResponse = await supertest(app)
        .post('/api/users/forgotPassword')
        .send({
          email: 'testEmail@nybagelsclub.com'
        });
      expect(forgotPasswordResponse.status).toBe(HttpStatusCodes.NOT_FOUND);
    });
    it('should return not found if a reset request does not exist for the provided reset id',async()=>{
      const response = await supertest(app)
        .get(`/forgotPassword/${'testID'}`)
      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });
    it('should get the status of a forgot password reset',async()=>{
      //request a password reset
      const forgotPasswordResponse = await supertest(app)
        .post('/api/users/forgotPassword')
        .send({
          email: USER_EMAIL
        });
      expect(forgotPasswordResponse.status).toBe(HttpStatusCodes.OK);
      expect(forgotPasswordResponse.body.isEmailSent).toBe(true);
      //get the status of the reset

      /*
        need to create a dummy mongodb document for a password reset
        to continue
      */

      expect(true).toBe(false);
    });
    it('should update the users password',async()=>{
      //~~see the above test need a mongodb document of password resets to continue

      //register a user
      //request a password reset
      //update the password
      expect(true).toBe(false);
    });
  });
  describe('account settings',()=>{
    describe('get account settings',()=>{
      it('should return unauthorized if a jwt token was not provided', async()=>{
        const response = await supertest(app)
          .get('/api/users/settings')
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should get the current account settings',async()=>{
        const response = await supertest(app)
          .get('/api/users/settings')
          .set({
            'Authorization': `Bearer ${createUserResponse.body.token}`
          })
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.firstName).toBe(USER_FIRST_NAME);
        expect(response.body.lastName).toBe(USER_LAST_NAME);
        expect(response.body.email).toBe(USER_EMAIL);
      });
    });
    describe('update account settings',()=>{
      it('should return unauthorized if a jwt token was not provided', async()=>{
        const response = await supertest(app)
          .put('/api/users/settings')
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return bad request on missing fields', async () => {
        const missingFields = ['firstName', 'lastName', 'email', 'password', 'passwordConfirm'];
        for (const field of missingFields) {
          const userData:any = {
            firstName: USER_FIRST_NAME,
            lastName: USER_LAST_NAME,
            email: USER_EMAIL,
            password: USER_PASS,
            passwordConfirm: USER_PASS_CONF,
            currentPassword: USER_PASS
          };
          userData[field] = undefined;
    
          const response = await supertest(app)
          .put('/api/users/settings')
          .set({
            'Authorization': `Bearer ${createUserResponse.body.token}`
          })
          .send(userData);
          expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
        };
      });
      it('should update the current account settings',()=>{
        expect(true).toBe(false);
      });
      it('should invalidate the current jwt token on account update',()=>{
        expect(true).toBe(false);
      });
    });
  });
})