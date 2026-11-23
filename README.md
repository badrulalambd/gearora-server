
# Gearora Server – Backend REST API

Gearora Server is the backend REST API for **Gearora**, a full-stack equipment rental marketplace that connects equipment owners with customers. It handles database operations, equipment management, rental bookings, authentication, role-based authorization, payment processing, and dashboard analytics.

Built with Express.js and MongoDB, the backend provides secure and scalable API endpoints to support the Gearora frontend application.

---

## Project Overview

The Gearora backend manages the core functionalities of the equipment rental platform, including user management, equipment listings, rental bookings, payment processing, and dashboard analytics.

It integrates JWT-based authentication and role-based access control to ensure that customers, equipment owners, and administrators can securely access resources and perform authorized actions.

---

## Key Features

### Authentication & Authorization
- JWT token verification for protected API endpoints.
- Custom Express middleware for authentication and authorization.
- Role-based access control for Customers (Renters), Equipment Owners, and Admins.
- `verifyToken` middleware for verifying authenticated requests.
- `verifyRenter` middleware for renter-specific permissions.
- `verifyOwner` middleware for equipment owner-specific permissions.
- `verifyAdmin` middleware for administrator-only permissions.
- Secure API access based on user roles.

### Equipment Management
- Create, retrieve, update, and delete equipment listings.
- Manage equipment approval statuses.
- Retrieve approved equipment for public listing pages.
- Server-side search and filtering by equipment title, category, and availability.
- Equipment category management.
- Equipment availability management.
- Equipment details and owner information retrieval.

### Rental & Booking Management
- Create and manage rental bookings.
- Retrieve rental records for customers and equipment owners.
- Manage rental booking statuses.
- Check equipment availability.
- Calculate rental costs based on rental duration and quantity.
- Retrieve booking details and rental information.

### Payment Integration
- Stripe payment integration.
- Stripe Checkout session creation.
- Secure payment processing.
- Payment transaction management.
- Store payment information in MongoDB.
- Track payment statuses.
- Payment-related booking updates.

### User Management
- Retrieve registered users.
- Manage user information.
- Update user roles.
- Support Customer, Owner, and Admin roles.
- Retrieve user-related data for dashboard functionalities.

### Dashboard Analytics
Dynamic analytics for administrators and equipment owners.

**Admin Analytics:**
- Total users.
- Total equipment listings.
- Total bookings.
- Pending equipment approvals.
- Completed rentals.
- Total revenue.
- Monthly booking statistics.

**Owner Analytics:**
- Total listed equipment.
- Completed rentals.
- Total earnings.
- Monthly earnings.

---

## Technology Stack

- **Express.js 5** – Backend REST API framework.
- **MongoDB** – NoSQL database.
- **Node.js** – JavaScript runtime.
- **JWT (JOSE)** – Token verification and authentication.
- **Stripe** – Payment processing.
- **CORS** – Cross-origin request handling.
- **dotenv** – Environment variable management.

---

## NPM Packages

### Dependencies

- `cors` – Enables cross-origin requests between the frontend and backend.
- `dotenv` – Loads environment variables from the `.env` file.
- `express` – Backend framework for building REST API endpoints.
- `jose` – JWT verification and cryptographic operations.
- `mongodb` – MongoDB database connectivity and operations.
- `stripe` – Stripe payment integration and payment processing.

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/badrulalambd/gearora-server.git
```

### 2. Navigate to the Project Directory

```bash
cd gearora-server
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory and add the following environment variables:

```env
MONGODB_USER=your_mongodb_username
MONGODB_PASSWORD=your_mongodb_password

CLIENT_URL=http://localhost:3000

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
```

> **Note:** Replace the placeholder values with your actual credentials. Never commit your `.env` file or expose sensitive credentials in your public repository.

### 5. Run the Server

Start the backend server using Node.js:

```bash
node index.js
```

The backend server will start at the configured port. By default, Gearora's frontend expects the backend API to be available at:

```text
http://localhost:5000
```

---

## Frontend Integration

Gearora Server provides the REST API required by the Gearora frontend application.

- **Frontend Repository:** [Gearora Client](https://github.com/badrulalambd/gearora)
- **Live Frontend:** [https://gearora.vercel.app](https://gearora.vercel.app)

Ensure that the backend server is running and properly configured before starting the frontend application.

---

## Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_USER` | MongoDB database username |
| `MONGODB_PASSWORD` | MongoDB database password |
| `CLIENT_URL` | Frontend URL used for CORS configuration |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Stripe secret key used for server-side payment operations |

---

## Project Structure

```text
gearora-server/
├── index.js
├── .env
├── package.json
├── package-lock.json
└── ...
```

---

## Developer

**GitHub:** [badrulalambd](https://github.com/badrulalambd)

---

<p align="center">
  <strong>Gearora Server – Powering seamless equipment rentals.</strong>
</p>
