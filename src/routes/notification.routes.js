import { Router } from "express";
import {notifications, markAsaRead, markedAsAllRead, deleteNotification, updateNotificationPreference} from "../controllers/notification.controller.js";
import  JWTverify  from "../middlewares/auth.middleware.js";

const router = Router();

router.use(JWTverify);

router.route("/").get(notifications);

router.route("/:notificationId/read").patch(markAsaRead);

router.route("/read-all").patch(markedAsAllRead);

router.route("/:notificationId").delete(deleteNotification);
router.route("/notificationPreferences").put(updateNotificationPreference);

export default router;
