const mongoose = require("../db");
const testSchema = new mongoose.Schema({
	userName: {
		type: String,
		required: true,
		index: true,
		unique: true
	}
}, {
	collection: "test"
});

const Test = mongoose.model("Test", testSchema, "test");

module.exports = Test;
