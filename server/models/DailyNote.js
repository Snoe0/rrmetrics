const mongoose = require('mongoose');

const DailyNoteSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  owner: {
    type: mongoose.Schema.ObjectId,
    required: true,
    ref: 'Account',
  },
});

DailyNoteSchema.index({ owner: 1, date: 1 }, { unique: true });

const DailyNoteModel = mongoose.model('DailyNote', DailyNoteSchema);
module.exports = DailyNoteModel;
