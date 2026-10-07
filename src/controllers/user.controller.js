import { v2 as cloudinary } from "cloudinary";
import User from "../models/user.model.js";
import Like from "../models/like.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import sendMail from "../utils/mailers.js";
import { uploadOnCloudinary, extractCloudinaryId } from "../utils/cloudinary.js";
import {generateRefreshAndAccessToken, generateToken} from "../utils/genrateToken.js";
// import { stripe } from "../app.js";
import  Category  from "../models/category.model.js";
import mongoose from "mongoose";
import { VerificationToken } from "../models/verificationToken.model.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import Event from "../models/event.model.js";
import { registerEvent } from "./register.controller.js";
import EventRegistration from "../models/register.model.js";


const stripe = null;

const generateAccountLink = async (accountId) => {
    const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.CLIENT_URI}/onboarding/refresh`,
        return_url: `${process.env.CLIENT_URI}/onboarding/success`,
        type: "account_onboarding",
    });
    return accountLink.url;
};

const registerUser = asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    
    if ([email, password, name].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new ApiError(400, "Invalid email format");
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new ApiError(409, "Username or email already exists");
    }

    // creating  new user
    const newRegistredUser = await User.create({ email, password, name })
    const {password:_, refershToken: __, ...user} = newRegistredUser.toObject()
    

    const data = {
        to: email,
        subject: "Eventopia Confirmation",
        text: "You have successfully become part of eventopia community",
        html: "<b>You have successfully become part of the Eventopia community</b>",
    };

    const confirmationMail = await sendMail(data);
    if (!confirmationMail) {
        throw new ApiError(500, "Somthing went worng with mailer");
    }

    // safeNotify(() => createWelcomeMessage(user))

    return res
        .status(200)
        .json(new ApiResponse(201, user, "User registred successfully"));
});

const login = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;

    // Checking if all fields have been filled or not.
    if (!username && !email) {
        throw new ApiError(400, "username or email required");
    }

    if (!password) {
        throw new ApiError(400, "Password is required");
    }
    // Checking if user exist or not
    const user = await User.findOne({ $or: [{ username }, { email }] }).select("+password");

    if (!user) {
        throw new ApiError(401, "Invalid credentials");
    }
    
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }

    const { refreshToken, accessToken } = await generateRefreshAndAccessToken(
        user._id
    );

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    const isProduction = process.env.NODE_ENV === "production";

    const accessTokenOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "None" : "Lax",
        maxAge: 24 * 60 * 60 * 1000,
    };

     const refreshTokenOptions = {
         httpOnly: true,
         secure: isProduction,
         sameSite: isProduction ? "None" : "Lax",
         maxAge: 7 * 24 * 60 * 60 * 1000,
     };

    return res
        .status(200)
        .cookie("refreshToken", refreshToken, refreshTokenOptions)
        .cookie("accessToken", accessToken, accessTokenOptions)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                },
                "User logged in Successfully"
            )
        );
});

const logout = asyncHandler(async (req, res) => {
    if (!req.user?._id) {
        throw new ApiError(401, "User is not found")
    }

    await User.findByIdAndUpdate(
        req?.user?._id,
        {
            $unset: {
                refreshToken: 1,
            },
        },
        {
            new: true,
        }
    );

    const isProduction = process.env.NODE_ENV === "production";

    const options = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "None" : "Strict",
    };

    return res
        .status(200)
        .clearCookie("refreshToken", options)
        .clearCookie("accessToken", options)
        .json(new ApiResponse(200, {}, "Logged out successfully"));
});

const currentUser = asyncHandler(async (req, res) => {
    return await res
        .status(200)
        .json(new ApiResponse(200, req.user, "Here is the user"));
});

const forgetPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, "Wrong email");
    }

    const resetToken = user.generateResetToken();

    if (!resetToken) {
        throw new ApiError(502, "JWT Token is not able to generate!");
    }

    const resetLink = `${process.env.CLIENT_URI}/reset-password?token=${resetToken}`;

    const data = {
        to: email,
        subject: "Grupio Reset Password Link",
        text: `Click this link to reset your password: ${resetLink}`,
        html: `<a href="${resetLink}">Reset Password</a>`,
    };
    await sendMail(data);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Reset Link was sent successfully!"));
});

const resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

 

    if (!(token && newPassword)) {
        throw new ApiError(400, "Token and new password are required");
    }


    let veryfyToken;
    try {
        console.log("Hello from jwt verify")
        veryfyToken = jwt.verify(token, process.env.JWT_SECRET_TOKEN);
    } catch (error) {
        console.log("JWT verify failed:", error.message);
        throw new ApiError(410, "Token has been expired or invaild");
    }
    console.log("Token verified, payload:", veryfyToken);


    const user = await User.findById(veryfyToken?._id);

    if (!user) {
        throw new ApiError(410, "Token has expired or is invalid");
    }

    user.password = newPassword;
    await user.save();

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password reset sucessfully!"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incommingRefreshToken =
        req.cookies?.accessToken || req.body.accessToken;
    if (!incommingRefreshToken) {
        throw new ApiError(401, "Unautherized request");
    }
    try {
        const decodedToken = jwt.verify(
            incommingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken._id);

        if (!user) {
            throw new ApiError(401, "Invaild refersh token");
        }

        if (incommingRefreshToken !== user?.refershToken) {
            throw new ApiError(401, "Refreshed token is expired or used");
        }

        const isProduction = process.env.NODE_ENV === "production";

        const options = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "None" : "Strict",
            maxAge: 24 * 60 * 60 * 1000,
        };

        const { accessToken, newRefreshToken } =
            await generateRefreshAndAccessToken(user._id);

        return res
            .status(200)
            .cookie("refreshAccessToken", newRefreshToken, options)
            .cookie("accessToken", accessToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        accessToken,
                        refershToken: newRefreshToken,
                    },
                    "Access Token refreshed"
                )
            );
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

const updateUserProfile = asyncHandler(async (req, res) => {

    const { name, bio } = req.body;
    const avatarLocalPath = req.file?.path;

    const user = await User.findById(req.user._id);
    
    if (!user) {
        throw ApiError(401, "Unauthorized");
    }

    if(avatarLocalPath){
        const avatar = await uploadOnCloudinary(avatarLocalPath)
        if(user.avatar){
            const extractedId = await extractCloudinaryId(user.avatar)
            await cloudinary.uploader.destroy(extractedId)
        }
        user.avatar = avatar.secure_url;
    }

    if (name !== undefined && name.trim()) user.name = name;
    if (bio !== undefined && bio.trim()) user.bio = bio;


    const updatedUser = await user.save();

    if (!updatedUser) {
        throw ApiError(502, "Somthing went wrong while updating user profile");
    }

    return res
        .status(202)
        .json(
            new ApiResponse(202, updatedUser, "Profile updated successfully")
        );
});

const changePassword = asyncHandler(async (req, res) => {
    const { password, newPassword } = req.body;

    console.log("password", password);
    console.log("newPassword", newPassword);

    const user = await User.findById(req.user?._id).select("+password");

    console.log("stored hash:", user.password);

    const isPasswordValid = await user.isPasswordCorrect(password);

    console.log("isCorrect", isPasswordValid)

    if (!isPasswordValid) {
        throw new ApiError(401, "needed correct password");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(202, "Password changed successfully"));
});

const updateAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = await req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(401, "Avatar is missing");
    }
    const newAvatar = await uploadOnCloudinary(avatarLocalPath);

    if (!newAvatar.url) {
        throw new ApiError(400, "Error while uploading avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: newAvatar.url,
            },
        },
        { new: true }
    ).select("-password");

    if (user.avatar) {
        await cloudinary.uploader.destroy(user.avatar);
    }

    return res
        .status(200)
        .json(new ApiResponse(202, user, "Avatar updated successfully"));
});

const userLikedEvents = asyncHandler(async (req, res) => {
    const likes = await Like.find({ likedBy: req.user._id });
    return res
        .status(200)
        .json(new ApiResponse(200, likes, "Events Liked by user"));
});


const userHistory = asyncHandler(async (req, res) => {
    const organized = await Event.find({
        organizerId: req.user._id,
        startDateTime: { $lt: new Date() },
    })
        .select("title image location status startDateTime")
        .sort({ startDateTime: -1 });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                history: {
                    organized,
                },
            },
            "History fetched successfully"
        )
    );
});

const onboardingUser = asyncHandler(async (req, res) => {
    const { interests = [], location, preferredCategories } = req.body;

    const user = await User.findById(req.user._id).select(
        "onboardingCompleted"
    );
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (user.onboardingCompleted) {
        throw new ApiError(
            400,
            "Onboarding already completed. Update your preferences in profile settings."
        );
        
    }

    
    const uniqueInterests = [
        ...new Set(
            interests
                .map((interest) =>
                    interest
                        .toLowerCase()
                        .trim()
                        .replace(/<[^>]*>/g, "")
                )
                .filter(
                    (interest) => interest.length > 0 && interest.length < 50
                )
        ),
    ];

    const uniquePreferredCategories = [
        ...new Set(
            preferredCategories
                .map((c) => c.toLowerCase().trim())
                .filter(Boolean)
        ),
    ];
    console.log(uniqueInterests.length)
    const totalCount =
        uniqueInterests.length + uniquePreferredCategories.length;

    if (totalCount < 2) {
        throw new ApiError(400, "At least 2 preferences are required");
    }

    if (totalCount > 5) {
        throw new ApiError(400, "Maximum 5 preferences allowed");
    }

    if (!location) {
        throw new ApiError(400, "Location is required");
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                interests: uniqueInterests,
                preferredCategories: uniquePreferredCategories,
                location,
                onboardingCompleted: true,
            },
        },
        { new: true, runValidators: true }
    );

    // safeNotify(() => onboardingUserNotification(updatedUser));

    return res
        .status(202)
        .json(new ApiResponse(202, updatedUser, "User onboarded successfully"));
});

const togglePreferredCategory = asyncHandler (async (req, res) => {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        throw new ApiError(400, "Invalid category ID");
    }
    const category = await Category.findOne({
        _id: categoryId,
        $or: [{ type: "system" }, { type: "custom", createdBy: req.user._id }],
        isActive: true,
    });

    if (!category) {
        throw new ApiError(404, "Invalid category ID");
    }

    const user = await User.findById(req.user._id);
    if (!user) throw new ApiError(404, "User not found");

    const isExisted = user.preferredCategories.some(
        (cat) => cat.toString() === categoryId
    );

    if (isExisted) {
        if (user.preferredCategories.length <= 2) {
            throw new ApiError(400, "At least 2 preferred category required");
        }

        user.preferredCategories = user.preferredCategories.filter(
            (id) => id.toString() !== categoryId
        ); 

    } else {
        if (user.preferredCategories.length >= 5) {
            throw new ApiError(400, "Maximum 5 categories allowed");
        }
        const something = await user.preferredCategories.push(categoryId);
        console.log(something)
    }
    await user.save({ validateBeforeSave: true });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                action: isExisted ? "removed" : "added",
                category: {
                    _id: category._id,
                },
            },
            `${category.name} ${isExisted ? "removed from" : "added to"} preferences`
        )
    );
})

const changeEmail = asyncHandler (async (req, res) => {
    const user = await User.findById(req.user._id).select("+password");

    if(!user) throw new ApiError("404", "user not found");

    const {newEmail, password} = req.body

    if (!newEmail || !password) {
        throw new ApiError(400, "All fields are required");
    }
    const normalizedEmail = newEmail.toLowerCase().trim();

    if(user.email === normalizedEmail) throw new ApiError(400, "Email must be different");

    const validEmail = await User.findOne({email: normalizedEmail})

    if(validEmail) throw new ApiError(409, "Email already in use");
   
    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) throw new ApiError("401", "Invalid credentials");

    const token = await generateToken();

    if (!token) {
        throw new ApiError(500, "Failed to generate token");
    }

    await VerificationToken.create({
        userId: user._id,
        token: crypto.createHash("sha256").update(token).digest("hex"),
        type: "email_change",
        metadata: { newEmail: normalizedEmail },
        expiry: Date.now() + 15 * 60 * 1000,
    });

    const confirmationMail = await sendMail({
        to: normalizedEmail,
        subject: "Confirm your email change",
        html: `<a href="${process.env.CLIENT_URI}/verifying-request?token=${token}">
            Confirm Email Change
          </a>`,
    });

    if (!confirmationMail) {
        throw new ApiError(500, "Somthing went worng with mailer");
    }
    

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Verification email sent. Please confirm to update email."
            )
        );

})

const emailUpdateConfirmation = asyncHandler (async (req, res) => {
    const { token } = req.query;
    if (!token) {
        throw new ApiError(400, "Token is required");
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");


    const verificationRequest = await VerificationToken.findOne({
        token: hashedToken,
        type: "email_change",
        expiry: { $gt: Date.now() },
    });


    if (!verificationRequest)
        throw new ApiError(400, "Token is invalid or expired");


    const user = await User.findById(verificationRequest.userId);

    console.log("user", user);

    if (!user) throw new ApiError(404, "User not found");

    user.email = verificationRequest.metadata.newEmail;

    await user.save();

    await VerificationToken.deleteOne({ _id: verificationRequest._id });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { email: user.email},
                "Email updated successfully!"
            )
        );
})

const updateLocation = asyncHandler(async (req, res) => {
    const { location } = req.body;

    const user = await User.findById(req.user._id);

    if (!location || !location.city || !location.coordinates) {
        throw new ApiError(400, "Invalid location data");
    }

    const existingCoords = user.location?.coordinates;
    const newCoords = location?.coordinates;

    const alreadyExists =
        existingCoords?.length === 2 &&
        newCoords?.length === 2 &&
        existingCoords[0] === newCoords[0] &&
        existingCoords[1] === newCoords[1];

    if (alreadyExists) {
        throw new ApiError(400, "Location already exists");
    }

    user.location = location;
    await user.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { location: user.location },
                "Location updated successfully"
            )
        );
});



export {
    registerUser,
    login,
    logout,
    currentUser,
    forgetPassword,
    refreshAccessToken,
    updateUserProfile,
    changePassword,
    updateAvatar,
    resetPassword,
    userLikedEvents,
    userHistory,
    onboardingUser,
    togglePreferredCategory,
    changeEmail,
    emailUpdateConfirmation,
    updateLocation
};

// when user click change email