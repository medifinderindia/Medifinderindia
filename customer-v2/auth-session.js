(() => {
  "use strict";

  async function requireAuthenticatedUser(client) {
    if (!client || !client.auth ||
        typeof client.auth.getSession !== "function" ||
        typeof client.auth.getUser !== "function") {
      throw new Error("The existing Supabase Auth client is unavailable.");
    }
    const sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data && sessionResult.data.session;
    if (!session || !session.user || !session.user.id) {
      return { authenticated: false, user: null };
    }

    // Confirm the session with Auth rather than trusting local storage alone.
    const userResult = await client.auth.getUser();
    if (userResult.error) throw userResult.error;
    const user = userResult.data && userResult.data.user;
    if (!user || user.id !== session.user.id) {
      return { authenticated: false, user: null };
    }
    return { authenticated: true, user };
  }

  window.MFCustomerV2Auth = Object.freeze({ requireAuthenticatedUser });
})();