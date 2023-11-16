import { passwordResetTokens } from "@src/helpers/auth";
import { getRandomUrlString } from "@src/helpers/misc";
import { Order, PasswordReset } from "@src/interfaces/interfaces";

export const getNewRegistrationMailOptions = function(email:string){
  return({
    from: 'noreply@nybagelsclub.com',
    to: email,
    subject: 'Account Registration Confirmation',
    html: 
      `
        <p style="font-size: 16px;">Welcome to the New York Bagels Club Family!</p>
        <p style="font-size: 16px;">This email is confirmation that we have successfully created your account.</p>
        <p style="font-size: 16px;">We're truly grateful for your interest in our products, and we can't wait to share our delicious hand-curated menu with you.</p>
        <p style="font-size: 16px;">Sincerely,</p>
        <p style="font-size: 16px;">New York Bagels Club
      `,
  })
};

export const getOrderPlacedMailOptions = function(
  userEmail:string,
  order:Order
){
  const getFormattedSelection = function(cat:string, selection?:string):string{
    let formattedSelection:string = '';
    switch(cat){
      case 'spread':
        formattedSelection = '1 LB';
        break;
      case 'bagel':
        if (selection==='six') formattedSelection = 'Six Pack';
        if (selection==='dozen') formattedSelection = "Baker's Dozen";
        break;
    }
    return formattedSelection;
  };
  
  return({
    from: 'noreply@nybagelsclub.com',
    to: userEmail,
    subject: `Order Placed Successfully #${order._id}`,
    html: 
      `
      <p style='font-size: 16px>Thank you for choosing New York Bagels Club!</p>
      <br />
      <li class='order-item' style='font-size: 16px;'>
      <button class='order-item-expand-toggle' style='font-size: 16px;'>
        <span class='order-date' style='font-size: 16px;'>Order Date: ${order.dateCreated.toDateString()}</span>
        <span class='order-id' style='font-size: 16px;'>Order Number: #${order._id}</span>
      </button>
      <div class='order-info-wrapper' style='font-size: 16px;'>
        <div style='font-size: 16px;'>
          <h4 style='font-size: 16px;'>Shipping Address</h4>
          <ul class='order-item-shipping' style='font-size: 16px;'>
            <li style='font-size: 16px;'>${order.shippingAddress.fullName}</li>
            <li style='font-size: 16px;'>${order.shippingAddress.phone}</li>
            <li style='font-size: 16px;'>${order.shippingAddress.line1}</li>
            <li style='font-size: 16px;'>${order.shippingAddress.city}</li>
            <li style='font-size: 16px;'>${order.shippingAddress.state}, ${order.shippingAddress.postal_code}</li>
            <li style='font-size: 16px;'>${order.shippingAddress.country}</li>
          </ul>
        </div>
        <div class='order-summary' style='font-size: 16px;'>
          <h4 style='font-size: 16px;'>Order Summary</h4>
          <ul style='font-size: 16px;'>
            ${order.cart.items.map((cartItem, index) => `
              <li key=${index} style='font-size: 16px;'>
                <span style='font-size: 16px;'>${cartItem.quantity}x ${cartItem.itemData.name} (${getFormattedSelection(cartItem.itemData.cat, cartItem.selection || '')}):</span>
                <span style='font-size: 16px;'><strong>$${(cartItem.unitPriceInDollars * cartItem.quantity).toFixed(2)}</strong></span>
              </li>
            `).join('')}
          </ul>
        </div>
        <div class='order-costs' style='font-size: 16px;'>
          <h4 style='font-size: 16px;'>Order Costs:</h4>
          <p style='font-size: 16px;'>
            <span style='font-size: 16px;'>Basket Subtotal:</span>
            <span style='font-size: 16px;'><strong>$${order.cart.subtotalInDollars.toFixed(2)}</strong></span>
          </p>
          ${order.cart.promoCodeID ? `
            <p style='font-size: 16px;'>
              <span style='font-size: 16px;'>Promo Code Savings:</span>
              <span style='font-size: 16px;'><strong>-$${order.cart.discountAmountInDollars.toFixed(2)}</strong></span>
            </p>
          ` : ''}
          <p style='font-size: 16px;'>
            <span style='font-size: 16px;'>Calculated Tax:</span>
            <span style='font-size: 16px;'><strong>$${order.cart.taxInDollars}</strong></span>
          </p>
          <p style='font-size: 16px;'>
            <span style='font-size: 16px;'>Shipping Cost:</span>
            <span style='font-size: 16px;'><strong>Free</strong></span>
          </p>
          <p style='font-size: 16px;'>
            <span style='font-size: 16px;'>Total Cost:</span>
            <span style='font-size: 16px;'><strong>$${order.cart.finalPriceInDollars.toFixed(2)}</strong></span>
          </p>
        </div>
        ${order.giftMessage !== '' ? `
          <div style='font-size: 16px;'>
            <h4 style='font-size: 16px;'>Gift Message:</h4>
            <p style='font-size: 16px;'>${order.giftMessage}</p>
          </div>
        ` : ''}
        <div style='font-size: 16px;'>
          <h4 style='font-size: 16px;'>Order Status</h4>
          <p style='font-size: 16px;'>${status}</p>
        </div>
        ${order.trackingNumberArr && (order.trackingNumberArr.length > 0) ? 
          order.trackingNumberArr.map((trackingNumber, index) => `
            <OrderTrackingItem index=${index} key=${index} trackingNumber=${trackingNumber} order=${order} />
          `).join('') : `
            <div key="noTracking" style='font-size: 16px;'>
              <h4 style='font-size: 16px;'>Track Your Order</h4>
              <p style='font-size: 16px;'>Check Back Soon!</p>
              <p style='font-size: 16px;'>Your selected ship date is <strong>${new Date(order.cart.desiredShipDate).toDateString()}</strong>.</p>
            </div>
          `}
      </div>
    </li>    
      `,
  })
};

export const getCustomOrderMailOptions = function(
  salesEmail:string,
  request:string,
  userEmail:string,
  quantityInput:string,
  requestsPackageDeal:boolean
){
  let requestsPackageDealStr:string = '';
  if (requestsPackageDeal){
    requestsPackageDealStr='want';
  }else{
    requestsPackageDealStr="don't want";
  };
  return({
    from: 'noreply@nybagelsclub.com',
    to: salesEmail,
    subject: 'Personalized Order Request',
    html: 
      `
        <p style="font-size: 16px;">A user with the email "${userEmail}" has requested a custom order</p>
        <p style="font-size: 16px;">They are requesting a quantity of, "${quantityInput}"</p>
        <p style="font-size: 16px;">They left this request for us, "${request}".</p>
        <p style="font-size: 16px;">They ${requestsPackageDealStr} the $275 package offering.</p> 
        <br />
        <p font-size: 20px;">Please respond to this inquiry within 24 hours.</p>
      `,
  })
};

export const getPasswordResetMailOptions = function(email:string){
  const randomString:string = getRandomUrlString(50);

  //get a random url string of 50 characters long and generate a reset url with it
  const url:string = `https://nybagelsclub.com/accounts/password/reset/${randomString}`;

  //create the password reset object
  const passwordReset:PasswordReset = {
    dateCreated: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
    resetID: randomString,
    email: email
  };
  
  //if the passwordResetTokens array is not empty check to see if there are any current pending tokens for the email and remove them
  if (passwordResetTokens.length>0){
    for (let i = passwordResetTokens.length - 1; i >= 0; i--) {
      if (passwordResetTokens[i].email === email) passwordResetTokens.splice(i, 1);
    };     
  };

  //push the password reset object to the reset tokens array for retrieval later
  passwordResetTokens.push(passwordReset);

  return({
    from: 'noreply@nybagelsclub.com',
    to: email,
    subject: 'Forgot Password',
    html: 
      `
        <p style="font-size: 16px;">We have received a request to update your account password.</p>
        <p style="font-size: 16px">If you initiated this action and wish to proceed with resetting your password, please click on the securely generated link: ${url}. Please note that this link will expire in 10 minutes for security purposes.</p>
        <p style="font-size: 16px">Sincerely,</p>
        <p style="font-size: 16px">New York Bagels Club</p>
      `,
  });
};