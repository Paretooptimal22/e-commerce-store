import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
  await redis.set(
    `refresh_token:${userId}`,
    refreshToken,
    "EX",
    7 * 24 * 60 * 60
  ); // 7 days
};

const setCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true, //prevent XSS attacks, cross-site scripting attacks
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", //prevents CSRF attacks, cross-site request forgery attacks
    maxAge: 15 * 60 * 1000, //15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true, //prevent XSS attacks, cross-site scripting attacks
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", //prevents CSRF attacks, cross-site request forgery attacks
    maxAge: 7 * 24 * 60 * 60 * 1000, //7 days
  });
};

export const signup = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        error: "User with that email already exists",
      });
    }
    const user = await User.create({ name, email, password });

    // authenticate user
    const { accessToken, refreshToken } = generateTokens(user._id);
    await storeRefreshToken(user._id, refreshToken);

    setCookies(res, accessToken, refreshToken);

    res.status(201).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      message: "Signup success",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  res.send("Login route called");
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      const decoded = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET
      );
      await redis.del(`refresh_token:${decoded.userId}`);
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.json({ message: "Logout success" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
