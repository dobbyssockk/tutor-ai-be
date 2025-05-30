# 🛠️ Tutor AI [Backend]

A secure Node.js + Express backend for the Tutor AI platform. Handles user authentication, OpenAI-powered responses, and chat history using PostgreSQL and Prisma ORM.

---

## 🔗 Related Project

> 👉 Frontend repository: [tutor-ai-fe](https://github.com/dobbyssockk/tutor-ai-fe)

---

## 🧭 Project Overview

This backend application powers the Tutor AI chatbot by managing user sessions, storing message history, and interacting with the OpenAI API to generate responses.  
Built with Express, it uses Prisma for database management and JWT for secure authentication. The service is structured for clean modularity and supports full integration with the frontend.

---

## 🚀 Features

- REST API built with Express
- JWT-based authentication with signup/login
- OpenAI response generation via structured prompts
- PostgreSQL integration with Prisma
- Password hashing with bcrypt
- CORS support for local frontend usage

---

## 📡 Available Endpoints

`POST /auth/sign-up`  
Creates a new user account with email, username, and hashed password.

`POST /auth/login`  
Authenticates a user and returns a JWT token with user info.

`GET /auth/me`  
Returns the currently authenticated user (requires token).

---

`GET /chats`  
Returns all chat sessions for the authenticated user.

`POST /chats`  
Creates a new chat with an initial user message and GPT-generated assistant reply.

`GET /chats/:chatId`  
Fetches a specific chat and its message history for the authenticated user.

`DELETE /chats/:chatId`  
Deletes a chat session belonging to the authenticated user.

---

`POST /chats/:chatId/messages`  
Appends a user message to an existing chat and returns the AI-generated assistant reply.

---

## 🛠️ Technologies Used

- **Node.js** – server runtime
- **Express.js** – REST API framework
- **Prisma** – ORM for PostgreSQL
- **PostgreSQL** – relational database
- **OpenAI SDK** – GPT-based response engine
- **bcrypt** – password hashing
- **jsonwebtoken** – secure token auth
- **CORS** – frontend-backend integration

---

## 💡 Key Concepts

- **Role-based prompt handling**: user vs assistant separation
- **Secure auth**: salted hashing + JWT
- **Scalable schema**: Prisma-based models for user, chat, message
- **OpenAI abstraction**: modular GPT request handler
- **Clean service structure**: libs, routes, and controllers separated

---

## 🐳 Database via Docker

To run the PostgreSQL database locally:

```bash
docker run --name tutorai-db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=tutorai \
  -p 5432:5432 \
  -d postgres
```

Then run:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

## 🧪 Local Installation

```bash
git clone https://github.com/dobbyssockk/tutor-ai-be.git
cd tutor-ai-be
npm install
npm run dev
```

🔑 Rename `.env.example` to `.env` and add your required environment variables
