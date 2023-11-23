import mongoose from 'mongoose';

const PasswordResetSchema = new mongoose.Schema({
  email:{
    type: String,
    required: true
  },
  resetID:{ //a unique string independent of the docID for extra security
    type: String,
    required: true
  },
  dateCreated:{
    type: Date,
    default: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
    required: true
  }
});

export const PasswordResetModel = mongoose.model('PasswordReset',PasswordResetSchema);