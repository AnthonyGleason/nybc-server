export const getRandomUrlString = function(length: number) {
  let counter: number = length;
  let string: string = '';
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
  while (counter > 0) {
    string += charset.charAt(Math.floor(Math.random() * charset.length));
    counter--;
  }
  return string;
};