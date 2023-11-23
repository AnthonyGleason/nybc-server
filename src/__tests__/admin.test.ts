describe('admin',()=>{
  beforeAll(()=>{
    //create an admin account
  })
  describe('verify admin',()=>{
    it('should return unauthorized if user is not an admin',()=>{
      expect(true).toBe(false);
    });
    it('should return unauthorized if no login token was provided',()=>{
      expect(true).toBe(false);
    });
    it('should return ok if user is an admin',()=>{
      expect(true).toBe(false);
    });
  });
  describe('password reset status',()=>{
    beforeAll(()=>{
      //create a dummy user
      //request a password reset
    })
    it('should return not found if a password reset doc was not found',()=>{
      expect(true).toBe(false);
    });
    it('should return unauthorized if user is not an admin',()=>{
      expect(true).toBe(false);
    });
    it('should return the password reset status for the user with the provided email in $x.xx format',()=>{
      expect(true).toBe(false);
    });
  });
  describe('promo codes',()=>{
    describe('get promo code total sales',()=>{
      beforeAll(()=>{
        //create 3 promo codes
      });
      it('should return unauthorized if user is not an admin',()=>{
        expect(true).toBe(false);
      });
      it('should correctly calculate the total sales amount for a promocode',()=>{
        expect(true).toBe(false);
      });
      it('should return not found if the promo code does not exist',()=>{
        expect(true).toBe(false);
      });
    });
    describe('update a promo code',()=>{
      beforeAll(()=>{
        //create a dummy promo code
      });
    });
    describe('get all promo codes',()=>{
      beforeAll(()=>{
        //create a 3 dummy promo codes
      });
    });
  });
  describe('orders',()=>{
    describe('get an order',()=>{
      beforeAll(()=>{
        //insert an order
      });
    });
    describe('update an order',()=>{
      beforeAll(()=>{
        //insert an order
      });
    });
    describe('get all pending orders',()=>{
      beforeAll(()=>{
        //insert 2 pending orders and 1 processing order
      });
    });
    describe('get all processing orders',()=>{
      beforeAll(()=>{
        //insert 2 processing orders and 1 pending order
      });
    });
    describe('search for an order',()=>{
      beforeAll(()=>{
        //insert 3 processing orders
      });
    });
    describe('get all orders for provided user',()=>{
      beforeAll(()=>{
        //create a user
        //give the user 3 orders
      });
    });
    describe('get all orders',()=>{
      beforeAll(()=>{
        //create two users
        //give each user the same 3 orders
      });
    });
  });
  describe('users',()=>{
    describe('search for a user',()=>{
      beforeAll(()=>{
        //create two users
      });
    });
    describe("get a user's membership data",()=>{
      beforeAll(()=>{
        //create a user
      });
    });
  });
});