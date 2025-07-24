// src/firebaseConfig.js

const firebaseConfig = {
  apiKey: "AIzaSyBBer3cFkUtWw6kX5xLlVNGrM4sABz2Lfc",
  authDomain: "sdg11-80ef8.firebaseapp.com",
  databaseURL: "https://sdg11-80ef8-default-rtdb.firebaseio.com",
  projectId: "sdg11-80ef8",
  storageBucket: "sdg11-80ef8.firebasestorage.app",
  messagingSenderId: "826716110413",
  appId: "1:826716110413:web:a99e15864ff926e2b1a604"
};

// For local development, we define these variables that the App.js expects.
// The __initial_auth_token is typically provided by the Canvas environment,
// but for local testing, you can leave it null for anonymous sign-in.
const initialAuthToken = null; // Leave as null for anonymous sign-in, or provide a specific token if needed for testing

// Export them so App.js can import them
export const __app_id = firebaseConfig.appId;
export const __firebase_config = JSON.stringify(firebaseConfig);
export const __initial_auth_token = initialAuthToken;