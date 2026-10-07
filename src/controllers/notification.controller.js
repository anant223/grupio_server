import Notification from "../models/notification.model.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import User from "../models/user.model.js";

const notifications = asyncHandler(async (req, res) => {
    const {page = 1, qty= 10} = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const qtyNumber = Math.min(20, Math.max(1, Number(qty) || 10));

    const [allNotifications, unReadCount, totalCount] = await Promise.all([
        Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * qtyNumber)
            .limit(qtyNumber)
            .populate("actor", "name avatar")
            .populate("event", "title startDateTime"),
        Notification.countDocuments({
            user: req.user._id,
            isRead: false,
        }),
        Notification.countDocuments({ user: req.user._id }),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                unReadCount,
                totalCount,
                totalPages: Math.ceil(totalCount / qtyNumber),
                currentPage: pageNumber,
                allNotifications,
            },
            "Notifications fetched successfully"
        )
    );

})

const markAsaRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notification = await Notification.markOneRead(
        notificationId,
        req.user._id
    );

    if (!notification) throw new ApiError(404, "Notification not found");

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { notification },
                "Marked as read successfully"
            )
        );
});

const markedAsAllRead = asyncHandler(async (req, res) => {

    const result = await Notification.markAllAsRead(
        req.user._id
    );

    if (result.modifiedCount === 0) {
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "No unread notifications to mark"));
    }


    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { updatedCount: result.modifiedCount },
                "Marked as read successfully"
            )
        );
})

const deleteNotification = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        user: req.user._id,
    });

    if (!notification) throw new ApiError(404, "Notification not found");

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Notification deleted successfully"));
});

//user notification notificationPreferences
const updateNotificationPreference = asyncHandler(async (req, res) => {
    const { key, value } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                [`notificationPreferences.${key}`]: value,
            },
        },
        { new: true }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                key,
                value: updatedUser.notificationPreferences[key],
            },
            "Notification preference updated"
        )
    );
});




export {notifications, markAsaRead, markedAsAllRead, deleteNotification, updateNotificationPreference}