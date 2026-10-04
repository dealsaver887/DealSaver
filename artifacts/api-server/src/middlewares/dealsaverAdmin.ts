import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";

export async function requireDealSaverAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access DealSaver admin." });
    return;
  }

  const expectedEmail = process.env.DEALSAVER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!expectedEmail) {
    res.status(503).json({
      error:
        "Admin access is not configured yet. Set DEALSAVER_ADMIN_EMAIL to the email used for your DealSaver sign-in.",
    });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const email =
      user.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      )?.emailAddress ?? "";

    if (email.trim().toLowerCase() !== expectedEmail) {
      res.status(403).json({
        error: "This account is not authorized to manage DealSaver deals.",
      });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ err: error }, "Could not verify DealSaver admin account");
    res.status(500).json({ error: "Could not verify admin access." });
  }
}