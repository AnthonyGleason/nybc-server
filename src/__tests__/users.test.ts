import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { salt } from "@src/constants/auth";
import { createNewUser } from "@src/controllers/user";
import app from "@src/server";
import supertest from "supertest";
import bcrypt from 'bcrypt';
import { issueUserJWTToken } from "@src/helpers/auth";
import { PasswordReset, User } from "@src/interfaces/interfaces";
import { before } from "node:test";
import { createPasswordReset, getPasswordResetByEmail } from "@src/controllers/passwordReset";

describe('users',()=>{
  //global declarations
  let createUserResponse:any;
  let createAdminToken:string = '';

  //this is the user credentials used to test the below routes (user is created in beforeAll)
  const USER_FIRST_NAME = 'firstName';
  const USER_LAST_NAME = 'lastName';
  const USER_EMAIL = 'newUser@nybagelsclub.com';
  const USER_PASS = 'password';
  const USER_PASS_CONF = 'password';

  //create the admin account
  const ADMIN_FIRST_NAME = 'Admin';
  const ADMIN_LAST_NAME = 'Admin';
  const ADMIN_EMAIL = 'admin@nybagelsclub.com';
  const ADMIN_PASS = 'password';
  const ADMIN_PASS_CONF = 'password';
  const ADMIN_GROUP = 'admin';
  
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
    //insert admin doc and sign a token for it
    const adminAccountDoc:User = await createNewUser(
      ADMIN_FIRST_NAME,
      ADMIN_LAST_NAME,
      ADMIN_EMAIL,
      await bcrypt.hash(ADMIN_PASS,salt),
      new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
      false,
      ADMIN_GROUP
    );
    createAdminToken = issueUserJWTToken(adminAccountDoc);
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
    let PASS_ACC_FIRST_NAME = 'test';
    let PASS_ACC_LAST_NAME = 'test';
    let PASS_ACC_EMAIL = 'forgotpasswordaccount@nybagelsclub.com';
    let PASS_ACC_PASS = 'password123';

    beforeAll(async ()=>{
      //register a test account
      await createNewUser(
        PASS_ACC_FIRST_NAME,
        PASS_ACC_LAST_NAME,
        PASS_ACC_EMAIL,
        await bcrypt.hash(PASS_ACC_PASS,salt),
        new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
        false
      );
      //request a password reset for the test account
      await supertest(app)
        .post('/api/users/forgotPassword')
        .set({
          email: PASS_ACC_EMAIL
        });
    });
    //optimize with promise.all the routes used they are too slow
    describe('request reset',()=>{
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
    });
    describe('get password reset status',()=>{
      it('should return not found if a reset request does not exist for the provided reset id',async()=>{
        const response = await supertest(app)
          .get(`/forgotPassword/${'testID'}`)
        expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
      });
      it('should return true if the password reset is valid',async()=>{
        //request a password reset
        const response = await supertest(app)
          .post('/api/users/forgotPassword')
          .send({
            email: PASS_ACC_EMAIL
          });
        expect(response.status).toBe(HttpStatusCodes.OK);
        expect(response.body.isEmailSent).toBe(true);
        const passResetStatusResponse = await supertest(app)
          .post('/api/admin/users/passwordResetStatus')
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
          .send({
            email: PASS_ACC_EMAIL
          });
        expect(passResetStatusResponse.status).toBe(HttpStatusCodes.OK);
        expect(passResetStatusResponse.body.isExpired).toBe(false);
      });
      it('should return false if the password reset is invalid',async()=>{
        //insert a password reset doc with an expired date
        await createPasswordReset(
          'invalidPasswordReset@nybagelsclub.com',
          'resetID123',
          new Date('December 1, 2001')
        );
        //request the password reset doc from the admin account
        const passResetStatusResponse = await supertest(app)
          .post('/api/admin/users/passwordResetStatus')
          .set({
            'Authorization': `Bearer ${createAdminToken}`
          })
          .send({
            email: 'invalidPasswordReset@nybagelsclub.com'
          });
        expect(passResetStatusResponse.status).toBe(HttpStatusCodes.UNAUTHORIZED);
        expect(passResetStatusResponse.body.isExpired).toBe(true);
      });
    });
    describe('update password',()=>{
      let UP_PASS_ACC_FIRST_NAME = 'test';
      let UP_PASS_ACC_LAST_NAME = 'test';
      let UP_PASS_ACC_EMAIL = 'updatepasswordaccount@nybagelsclub.com';
      let UP_PASS_ACC_PASS = 'password123';

      beforeAll(async ()=>{
        //register a test account
        await createNewUser(
          UP_PASS_ACC_FIRST_NAME,
          UP_PASS_ACC_LAST_NAME,
          UP_PASS_ACC_EMAIL,
          await bcrypt.hash(UP_PASS_ACC_PASS,salt),
          new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
          false
        );
        //request a password reset for the test account
        await supertest(app)
          .post('/api/users/forgotPassword')
          .send({
            email: UP_PASS_ACC_EMAIL
          });
      });
      it('should update the users password',async()=>{
        //update the password of the test account in the before all
        const passwordResetDoc: PasswordReset | null = await getPasswordResetByEmail(UP_PASS_ACC_EMAIL);
        if (passwordResetDoc){
          const response = await supertest(app)
            .put(`/api/users/forgotPassword/${passwordResetDoc.resetID}`)
            .send({
              password: 'updatedPassword',
              passwordConf: 'updatedPassword'
            });
          expect(response.status).toBe(HttpStatusCodes.OK);
        };
        //attempt to login with the new password a token should be provided
        const loginResponse = await supertest(app)
          .post('/api/users/login')
          .send({
            email: UP_PASS_ACC_EMAIL,
            password: 'updatedPassword'
          });
        expect(loginResponse.status).toBe(HttpStatusCodes.OK);
        expect(loginResponse.body.token).toBeDefined();
      });
      it('should return bad request if missing required input fields', async()=>{
        const missingFields = ['password', 'passwordConf'];
    
        for (const field of missingFields) {
          const body:any = {
            password: USER_PASS,
            passwordConf: USER_PASS_CONF
          };
          body[field] = undefined;
    
          const response = await supertest(app)
          .put('/api/users/forgotPassword/testID')
          .send(body);
          expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
        }
      });
      it('should return an error if password inputs do not match', async()=>{
        const response = await supertest(app)
          .put('/api/users/forgotPassword/testID')
          .send({
            password: USER_PASS,
            passwordConf: 'PasswordDoesNotMatch'
          })
        expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      });
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
    // if there is any major issues with testing try commenting out the below block it seems to be causing many issues possibly due to reusing account info
    describe('update account settings',()=>{
      let accountSettingsToken:any;
      beforeAll(async ()=>{
        //register a new user
        const response = await supertest(app)
          .post('/api/users/register')
          .send({
            firstName: USER_FIRST_NAME,
            lastName: USER_LAST_NAME,
            email: 'accountsettingsuser@nybagelsclub.com',
            password: USER_PASS,
            passwordConfirm: USER_PASS_CONF
          })
        accountSettingsToken = response.body.token;
      });
      it('should return unauthorized if a jwt token was not provided', async()=>{
        const response = await supertest(app)
          .put('/api/users/settings')
          .set({
            'Authorization': `Bearer ${undefined}`
          })
        expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
      it('should return bad request on missing fields', async () => {
        const missingFields = ['firstNameInput', 'lastNameInput', 'emailInput', 'passwordInput', 'passwordConfInput','currentPasswordInput'];
        for (const field of missingFields) {
          const userData:any = {
            firstNameInput: USER_FIRST_NAME,
            lastNameInput: USER_LAST_NAME,
            emailInput: USER_EMAIL,
            passwordInput: USER_PASS,
            passwordConfInput: USER_PASS_CONF,
            currentPasswordInput: USER_PASS
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
      it('should return bad request if passwords do not match', async()=>{
        //change each field in the user created in the beforeall
        const response:any = await supertest(app)
          .put('/api/users/settings')
          .set({
            'Authorization': `Bearer ${createUserResponse.body.token}`
          })
          .send({
            firstNameInput: USER_FIRST_NAME,
            lastNameInput: USER_LAST_NAME,
            emailInput: 'accountsettingsuser@nybagelsclub.com',
            passwordInput: USER_PASS,
            passwordConfInput: 'updatedPass123',
            currentPasswordInput: USER_PASS,
          })
        expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      });
      it('should return conflict if new email is already taken', async()=>{
        //try to switch email to an email already taken
        const response:any = await supertest(app)
          .put('/api/users/settings')
          .set({
            'Authorization': `Bearer ${accountSettingsToken}`
          })
          .send({
            firstNameInput: USER_FIRST_NAME,
            lastNameInput: USER_LAST_NAME,
            emailInput: USER_EMAIL,
            passwordInput: USER_PASS,
            passwordConfInput: USER_PASS_CONF,
            currentPasswordInput: USER_PASS,
          })
        expect(response.status).toBe(HttpStatusCodes.CONFLICT);
      });
      it('should update the current account settings', async ()=>{
        //change each field in the user created in the beforeall
        const updateUserResponse:any = await supertest(app)
          .put('/api/users/settings')
          .set({
            'Authorization': `Bearer ${accountSettingsToken}`
          })
          .send({
            firstNameInput: 'updatedFirstName',
            lastNameInput: 'updatedLastName',
            emailInput: 'updatedaccountsettingsuser@nybagelsclub.com',
            passwordInput: 'updatedPass',
            passwordConfInput: 'updatedPass',
            currentPasswordInput: USER_PASS,
          });
        //verify the fields were correctly updated
        expect(updateUserResponse.status).toBe(HttpStatusCodes.OK);
        expect(updateUserResponse.body.user.firstName).toBe('updatedFirstName');
        expect(updateUserResponse.body.user.lastName).toBe('updatedLastName');
        expect(updateUserResponse.body.user.email).toBe('updatedaccountsettingsuser@nybagelsclub.com');
        expect(updateUserResponse.body.user.hashedPassword).toBeDefined();
        expect(updateUserResponse.body.wasUserUpdated).toBe(true);
        //verify the token was invalidated
        const verifyResponse:any = await supertest(app)
          .get('/api/users/verify')
          .set({
            'Authorization': `Bearer ${accountSettingsToken}`
          })
        expect(verifyResponse.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      });
    });
  });
})