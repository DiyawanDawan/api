const express = require("express");

const app = express();

require("dotenv").config();

app.use(express.json());

const connectDB = require("./connectMongo");

connectDB();

const BookModel = require("./models/book.model");
const redis = require('./redis')

const deleteKeys = async (pattern) => {
  const keys = await redis.keys(`${pattern}::*`)
  console.log(keys)
  if (keys.length > 0) {
    redis.del(keys)
  }
}
app.get("/api/v1/books", async (req, res) => {
  const { limit = 5, orderBy = "name", sortBy = "asc", keyword } = req.query;
  let page = +req.query?.page;

  if (!page || page <= 0) page = 1;

  const skip = (page - 1) * +limit;

  const query = {};

  if (keyword) query.name = { $regex: keyword, $options: "i" };

  const key = `Book::${JSON.stringify({ query, page, limit, orderBy, sortBy })}`;
  let response = null;

  try {
    console.log(`Fetching data for key: ${key}`);

    const cache = await new Promise((resolve, reject) => {
      client.get(key, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (cache) {
      console.log("Cache hit");
      response = JSON.parse(cache);
    } else {
      console.log("Cache miss, querying database");

      const data = await BookModel.find(query)
        .skip(skip)
        .limit(+limit)
        .sort({ [orderBy]: sortBy });
      
      const totalItems = await BookModel.countDocuments(query);

      response = {
        msg: "Ok",
        data,
        totalItems,
        totalPages: Math.ceil(totalItems / +limit),
        limit: +limit,
        currentPage: page,
      };

      await new Promise((resolve, reject) => {
        client.setex(key, 600, JSON.stringify(response), (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error occurred:", error);
    return res.status(500).json({
      msg: error.message,
    });
  }
});


app.get("/api/v1/books/:id", async (req, res) => {
  try {
    const data = await BookModel.findById(req.params.id);

    if (data) {
      return res.status(200).json({
        msg: "Ok",
        data,
      });
    }

    return res.status(404).json({
      msg: "Not Found",
    });
  } catch (error) {
    return res.status(500).json({
      msg: error.message,
    });
  }
});

app.post("/api/v1/books", async (req, res) => {
  try {
    const { name, author, price, description } = req.body;
    const book = new BookModel({
      name,
      author,
      price,
      description,
    });
    const data = await book.save();
    deleteKeys('Book')
    return res.status(200).json({
      msg: "Ok",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      msg: error.message,
    });
  }
});

app.put("/api/v1/books/:id", async (req, res) => {
  try {
    const { name, author, price, description } = req.body;
    const { id } = req.params;

    const data = await BookModel.findByIdAndUpdate(
      id,
      {
        name,
        author,
        price,
        description,
      },
      { new: true }
    );
    deleteKeys('Book')
    return res.status(200).json({
      msg: "Ok",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      msg: error.message,
    });
  }
});

app.delete("/api/v1/books/:id", async (req, res) => {
  try {
    await BookModel.findByIdAndDelete(req.params.id);
    deleteKeys('Book')
    return res.status(200).json({
      msg: "Ok",
    });
  } catch (error) {
    return res.status(500).json({
      msg: error.message,
    });
  }
});

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log("Server is running on port " + PORT);
});
