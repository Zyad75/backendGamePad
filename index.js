//serveur + database
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

//gestion du mdp et token
const uid2 = require("uid2");
const SHA256 = require("crypto-js/sha256");
const encBase64 = require("crypto-js/enc-base64");

// cors pour les requetes, app pour créer les différentes routes, use json pour les parametres body
const app = express();
app.use(cors());
app.use(express.json());

// variables d'environnement
require("dotenv").config();
mongoose.connect(process.env.MONGODB_URI);

//model user
const User = mongoose.model("User", {
  email: { type: String, unique: true },
  username: String,
  token: String,
  hash: String,
  salt: String,
});

//model favoris
const Favorite = mongoose.model("Favorite", {
  gameId: String,
  title: String,
  image: String,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

//model review

const Review = mongoose.model("Review", {
  gameId: String,
  title: String,
  review: String,
  owner: String,
  date: {
    type: Date,
    default: Date.now,
  },
});

/// route pour s'inscrire
app.post("/signup", async (req, res) => {
  try {
    console.log(req.body);
    // ai-je tout ?
    if (!req.body.username || !req.body.email || !req.body.password) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    const existingUser = await User.findOne({ email: req.body.email });

    if (existingUser) {
      return res.status(409).json({ error: "email already used" });
    }
    const existingUsername = await User.findOne({
      username: req.body.username,
    });
    if (existingUsername) {
      return res.status(409).json({ error: "username already used" });
    }
    // 1) salt et token
    const salt = uid2(16);
    const token = uid2(32);

    // 2) hashing
    const hash = SHA256(req.body.password + salt).toString(encBase64);

    // 3) on enregistre le user

    const newUser = new User({
      email: req.body.email,
      username: req.body.username,
      token: token,
      salt: salt,
      hash: hash,
    });

    console.log(newUser);

    await newUser.save();

    res.status(201).json({
      _id: newUser._id,
      token: newUser.token,
      username: newUser.username,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    console.log(req.body);
    // ai-je tout ?
    if (!req.body.email || !req.body.password) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    const userFound = await User.findOne({ email: req.body.email });

    if (!userFound) {
      return res.status(400).json({ error: "email inccorect" });
    }

    const newHash = SHA256(req.body.password + userFound.salt).toString(
      encBase64
    );

    if (userFound.hash !== newHash) {
      return res.status(400).json({ error: "email/mot de passe incorect" });
    }

    const responseObject = {
      _id: userFound._id,
      token: userFound.token,
      username: userFound.username,
    };

    res.json(responseObject);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//middleware authentification

const isAuthenticated = async (req, res, next) => {
  const token = req.headers.authorization.replace("Bearer ", "");

  //user  correspondant au token ?

  const user = await User.findOne({ token: token }).select("-salt -hash");

  if (!user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  req.user = user;
  next();
};
//route pour ajouter un jeux en favoris
app.post("/favorite", isAuthenticated, async (req, res) => {
  try {
    if (!req.body.title || !req.body.image) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    const existingFav = await Favorite.findOne({
      title: req.body.title,
      owner: req.user._id,
    });

    if (existingFav) {
      return res.status(409).json({ error: "Favorite already saved" });
    }
    const newFav = new Favorite({
      gameId: req.body.gameId,
      title: req.body.title,
      image: req.body.image,
      owner: req.user._id,
    });

    console.log(newFav);

    await newFav.save();
    res.status(200).json({ message: "Game added in Favorites" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// route en get pour avoir la liste des favoris liées à un compte user
app.get("/favoritesOfUser", isAuthenticated, async (req, res) => {
  try {
    const favs = await Favorite.find({ owner: req.user._id });
    if (!favs) {
      return res.status(401).json({ error: "No Favorites" });
    }

    res.status(200).json(favs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
//Route pour supprimer un Favoris (je n'ai pas réussi à la faire en route delete, lorsque je met le middleware isAuthenticated
// en route delete, ca ne fonctionne pas)
app.post("/deleteFav", isAuthenticated, async (req, res) => {
  try {
    console.log(req.body.title);
    console.log(req.user._id);
    const favToDelete = await Favorite.deleteOne({
      title: req.body.title,
      owner: req.user._id,
    });
    res.status(200).json(favToDelete);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Route pour ajouter une review sur un game,
app.post("/review", isAuthenticated, async (req, res) => {
  try {
    if (!req.body.review || !req.body.title || !req.body.gameId) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    const existingReviewOnThisGame = await Review.findOne({
      gameId: req.body.gameId,
      owner: req.user.username,
    });
    if (existingReviewOnThisGame) {
      return res
        .status(409)
        .json({ message: "error, you already write a review on this game" });
    }
    const date = Date.now();
    const newReview = new Review({
      title: req.body.title,
      review: req.body.review,
      owner: req.user.username,
      gameId: req.body.gameId,
      date: date,
    });
    await newReview.save();
    res.status(201).json("Review Successfuly added !");
  } catch (error) {
    console.log(error);
  }
});
//route pour obtenir les reviews en fonction du jeu
app.get("/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ gameId: req.query.gameId });
    if (!reviews) {
      return res.status(400).json({ message: "no reviews for this game" });
    }
    res.json(reviews);
  } catch (error) {
    console.log(error);
  }
});

app.all("*", (req, res) => {
  res.json({ message: "all Routes" });
});
const PORT = 3000;
app.listen(process.env.PORT || PORT, () => {
  console.log("server GamePad Connected");
});
