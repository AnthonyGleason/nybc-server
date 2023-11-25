import { salt } from "@src/constants/auth";
import { createNewUser } from "@src/controllers/user";
import { issueUserJWTToken } from "@src/helpers/auth";
import { User } from "@src/interfaces/interfaces";
import bcrypt from 'bcrypt';

//create an admin account
const ADMIN_FIRST_NAME = 'Admin';
const ADMIN_LAST_NAME = 'Admin';
const ADMIN_EMAIL = 'admin@nybagelsclub.com';
const ADMIN_PASS = 'password';
const ADMIN_PASS_CONF = 'password';
const ADMIN_GROUP = 'admin';

// Create user
export const USER_FIRST_NAME = 'firstName';
export const USER_LAST_NAME = 'lastName';
export const USER_EMAIL = 'newUser@nybagelsclub.com';
export const USER_PASS = 'password';
export const USER_PASS_CONF = 'password';

export const createAdminAccount = async function():Promise<string>{
  const adminAccountDoc:User = await createNewUser(
    ADMIN_FIRST_NAME,
    ADMIN_LAST_NAME,
    ADMIN_EMAIL,
    await bcrypt.hash(ADMIN_PASS,salt),
    new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
    false,
    ADMIN_GROUP
  );
  return issueUserJWTToken(adminAccountDoc);
};

export const createUserAccount = async function():Promise<string>{
  const userAccountDoc: User = await createNewUser(
    USER_FIRST_NAME,
    USER_LAST_NAME,
    USER_EMAIL,
    await bcrypt.hash(USER_PASS,salt),
    new Date(new Date().toLocaleDateString('en-US',{timeZone: 'America/New_York' })),
    false,
    'user'
  );
  return issueUserJWTToken(userAccountDoc);
}