const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000
const cors = require('cors')
require('dotenv').config()
const stripe = require("stripe")(process.env.SRTIPE_KEY)
// middleware
app.use(express.json())
app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true,
  optionSuccessStatus: 200
}));
app.use(cookieParser())
// database cunnection 
const client = new MongoClient(`${process.env.DB_URI}`, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
// cullections 
const categores = client.db("FrankStore").collection("categores")
const slider = client.db("FrankStore").collection("slider")
const products = client.db("FrankStore").collection("products")
const users = client.db("FrankStore").collection("users")
const cart = client.db("FrankStore").collection("cart")
// verify jwt 
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCES_TOCKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    req.user = decoded;
    next();
  })
}
async function run() {
  try {
    // jwt 
    // add user token
    app.post('/jwt', async (req, res) => {
      const userData = req.body;
      const token = jwt.sign(userData, process.env.ACCES_TOCKEN_SECRET, { expiresIn: '1h' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      })
        .send({ succes: true })
    })
    // clear user token
    app.post('/clearjwt', async (req, res) => {
      res.clearCookie('tocken', { maxAge: 0 })
        .send({ succes: true })
    })
    // payment 
    // payment intant
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
    
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseInt(price * 100),
        currency: "usd",
        payment_method_types: [
          "card"
        ],
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // users
    // post suers data //require('crypto').randomBytes(16).toString('hex')
    app.post('/users', async (req, res) => {
      const userData = req.body;
      const { useremail } = req.body;
      const query = { useremail: useremail }
      const alreadyhave = await users.find(query).toArray()
      if (alreadyhave.length > 0) {
        return res.send({ mag: 'user allready exist' })
      }
      const result = await users.insertOne(userData)
      res.send(result)
    })
    app.patch('/user', async (req, res) => {
      const userData = req.body;
      const { _id } = req.body;
      delete userData._id;
      const query = { _id: new ObjectId(_id) }
      const updateuser = {
        $set: {
          ...userData
        },
      };
      const result = await users.updateOne(query, updateuser)
      res.send(result)
    })
    // get single suers data
    app.get('/user', async (req, res) => {
      const { useremail } = req.query;
      const query = { useremail: useremail }
      const result = await users.findOne(query)
      res.send(result)
    })
    // category
    // get category data
    app.get('/categores', async (req, res) => {
      const result = await categores.find({}).toArray()
      res.send(result)
    })
    // slider
    // get slider data
    app.get('/slider', async (req, res) => {
      const result = await slider.find({}).toArray()
      res.send(result)
    })
    // products
    //get products data

    // count products
    // get total number of products
    app.get('/productCount', async (req, res) => {
      const result = await products.countDocuments();
      res.json(result)
    })
    // single products
    // get single products data
    app.get('/productDetails', async (req, res) => {
      const { id } = req.query;
      const query = { _id: new ObjectId(id) }
      const result = await products.findOne(query);
      res.send(result)
    })
    // single products relavent products
    // get single products relavent products data
    app.get('/relaventdata', async (req, res) => {
      const { category } = req.query;
      const query = { category: category }
      const result = await products.find(query).sort({ totalSold: -1 }).limit(4).toArray();
      res.send(result)
    })
    // all products
    // get all products data
    app.get('/products', async (req, res) => {
      const { categoryFilter, sortBy, sortValue, seacrhValue, pageNumber, itemPerPage } = req.query;
      let query = { productName: { $regex: `${seacrhValue}`, $options: 'i' } };
      if (categoryFilter !== 'all') {
        query = {
          ...query,
          category: `${categoryFilter}`
        }
      }
      let options = {};

      if (sortBy === 'mostsale') {
        options.sort = { totalSold: -1 };
      } else if (sortBy === 'price') {
        options.sort = { price: sortValue === 'LTH' ? 1 : -1 };
      }
      // console.log(req.query)
      const result = await products.find(query).skip(parseInt(pageNumber) * parseInt(itemPerPage)).limit(parseInt(itemPerPage)).sort(options.sort).toArray();
      res.send(result)
    })
    // cart
    //add to cart 
    app.post('/Cart', verifyToken, async (req, res) => {

      const { user, itemId } = req.body;
      const query = { user: user };

      const filter = await cart.findOne(query);

      if (filter !== null && filter.itemIds.some(id => id.toString() === itemId)) {
        return res.send({ msg: 'Item already added' });
      }

      if (filter !== null && !filter.itemIds.some(id => id.toString() === itemId)) {
        const result = await cart.updateOne(query, {
          $push: { itemIds: new ObjectId(itemId) },
        });
        return res.send(result);
      }

      const result = await cart.insertOne({ user, itemIds: [new ObjectId(itemId)] });
      return res.send(result);
    }
    );
    /* 
    
    const { user, itemId } = req.body;
const query = { user };

const result = await cart.findOneAndUpdate(
query,
{ $addToSet: { itemIds: itemId } },
{ upsert: true, returnDocument: 'after' }
);

res.send(result);

    */
    // cart
    //get cart data
    app.get('/Cart', verifyToken, async (req, res) => {
      const { useremail } = req.query;
      if (req.user.useremail !== useremail) {
        return res.status(403).send({message : 'forbidden access'})
      }
      const userEmail = 'fahadnadim0273@gmail.com';
      const result = await cart.aggregate([
        {
          $match: { user: userEmail }
        },
        {
          $unwind: '$itemIds'
        },
        {
          $lookup: {
            from: 'products',
            localField: 'itemIds',
            foreignField: '_id',
            as: 'cartData'
          }
        },
        {
          $project: {
            "_id": 1,
            "cartData": 1,
          }
        }
        // {
        //   $project: {
        //     "_id": 1,
        //     "cartData": 1,
        //     "user": 0, // Exclude the 'user' field
        //     "itemIds": 0, // Exclude the 'itemIds' field
        //   },
        // },
      ]).toArray();
      res.send(result);
    });

    // bestsale
    // get bestsale products data
    app.get('/bestsale', async (req, res) => {
      const largest = { totalSold: -1 };
      const result = await products.find({}).sort(largest).limit(4).toArray();
      res.send(result)
    })
    // get bestsale products for explore our products data
    app.get('/exploreproducts', async (req, res) => {
      const largest = { quantity: -1 };
      const result = await products.find({}).sort(largest).limit(15).toArray();
      res.send(result)
    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);
app.get('/', async (req, res) => {
  res.send('FrankStore Server is running')
})
app.listen(port, () => {
  console.log(`server is runing on port ${port}`)
})