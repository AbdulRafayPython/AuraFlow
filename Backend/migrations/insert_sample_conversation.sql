-- Insert sample conversation for testing Summarizer and Knowledge Builder agents
-- Channel: general (ID: 21) in Python Developers community (ID: 18)
-- Users: 1 (Abdul Rafay), 2 (User 2), 4 (User 4)

INSERT INTO messages (channel_id, sender_id, content, created_at) VALUES
-- Python project discussion
(21, 1, 'Hey everyone! I''m starting a new Python project and need some advice on the tech stack.', NOW() - INTERVAL 2 HOUR),
(21, 4, 'What kind of project are you building?', NOW() - INTERVAL 2 HOUR + INTERVAL 2 MINUTE),
(21, 1, 'It''s a web application for task management with real-time collaboration features.', NOW() - INTERVAL 2 HOUR + INTERVAL 4 MINUTE),
(21, 2, 'For real-time features, I''d recommend using Flask-SocketIO or FastAPI with WebSockets.', NOW() - INTERVAL 2 HOUR + INTERVAL 6 MINUTE),
(21, 4, 'FastAPI is great! It has built-in async support and automatic API documentation.', NOW() - INTERVAL 2 HOUR + INTERVAL 8 MINUTE),
(21, 1, 'What about the database? Should I use PostgreSQL or MongoDB?', NOW() - INTERVAL 2 HOUR + INTERVAL 10 MINUTE),
(21, 2, 'PostgreSQL is more reliable for task management. You need ACID compliance for that.', NOW() - INTERVAL 2 HOUR + INTERVAL 12 MINUTE),
(21, 4, 'Agreed. Plus SQLAlchemy makes it easy to work with PostgreSQL in Python.', NOW() - INTERVAL 2 HOUR + INTERVAL 14 MINUTE),
(21, 1, 'Good point. What about authentication? JWT tokens?', NOW() - INTERVAL 2 HOUR + INTERVAL 16 MINUTE),
(21, 2, 'Yes, JWT is the standard. Use PyJWT library for that.', NOW() - INTERVAL 2 HOUR + INTERVAL 18 MINUTE),

-- Docker and deployment discussion
(21, 4, 'Are you planning to containerize the application?', NOW() - INTERVAL 1 HOUR + INTERVAL 50 MINUTE),
(21, 1, 'Yes, I want to use Docker for deployment. Any tips?', NOW() - INTERVAL 1 HOUR + INTERVAL 52 MINUTE),
(21, 2, 'Create a multi-stage Dockerfile to keep the image size small.', NOW() - INTERVAL 1 HOUR + INTERVAL 54 MINUTE),
(21, 4, 'And use docker-compose for local development with PostgreSQL and Redis services.', NOW() - INTERVAL 1 HOUR + INTERVAL 56 MINUTE),
(21, 1, 'Redis? Why do I need that?', NOW() - INTERVAL 1 HOUR + INTERVAL 58 MINUTE),
(21, 2, 'Redis is perfect for caching and as a message broker for Celery background tasks.', NOW() - INTERVAL 1 HOUR + INTERVAL 60 MINUTE),
(21, 4, 'You''ll definitely need background tasks for email notifications and scheduled task reminders.', NOW() - INTERVAL 1 HOUR + INTERVAL 62 MINUTE),

-- Frontend discussion
(21, 1, 'What should I use for the frontend? React or Vue?', NOW() - INTERVAL 1 HOUR + INTERVAL 30 MINUTE),
(21, 4, 'React has a larger ecosystem and better job market. I''d go with React.', NOW() - INTERVAL 1 HOUR + INTERVAL 32 MINUTE),
(21, 2, 'React with TypeScript is even better for type safety.', NOW() - INTERVAL 1 HOUR + INTERVAL 34 MINUTE),
(21, 1, 'TypeScript adds complexity though. Is it worth it?', NOW() - INTERVAL 1 HOUR + INTERVAL 36 MINUTE),
(21, 2, 'Absolutely! It catches bugs at compile time and makes refactoring much easier.', NOW() - INTERVAL 1 HOUR + INTERVAL 38 MINUTE),
(21, 4, 'Plus modern IDEs give you amazing autocomplete with TypeScript.', NOW() - INTERVAL 1 HOUR + INTERVAL 40 MINUTE),

-- Testing and CI/CD
(21, 1, 'What about testing? Should I write tests from the start?', NOW() - INTERVAL 1 HOUR),
(21, 2, 'Yes! Use pytest for backend tests. It''s the best Python testing framework.', NOW() - INTERVAL 1 HOUR + INTERVAL 2 MINUTE),
(21, 4, 'Write unit tests for business logic and integration tests for API endpoints.', NOW() - INTERVAL 1 HOUR + INTERVAL 4 MINUTE),
(21, 1, 'How do I set up CI/CD for automated testing?', NOW() - INTERVAL 1 HOUR + INTERVAL 6 MINUTE),
(21, 2, 'GitHub Actions is free for public repos and easy to set up.', NOW() - INTERVAL 1 HOUR + INTERVAL 8 MINUTE),
(21, 4, 'You can run tests on every push and deploy automatically to production on main branch merges.', NOW() - INTERVAL 1 HOUR + INTERVAL 10 MINUTE),

-- Performance and scaling
(21, 1, 'What if the app gets popular? How do I handle scaling?', NOW() - INTERVAL 50 MINUTE),
(21, 2, 'Start with a single server, then add load balancing with Nginx when needed.', NOW() - INTERVAL 48 MINUTE),
(21, 4, 'Database connection pooling is crucial. Use pgBouncer for PostgreSQL.', NOW() - INTERVAL 46 MINUTE),
(21, 1, 'Should I worry about horizontal scaling from the beginning?', NOW() - INTERVAL 44 MINUTE),
(21, 2, 'No, premature optimization is the root of all evil. Start simple and scale when you need to.', NOW() - INTERVAL 42 MINUTE),
(21, 4, 'But design your app to be stateless so horizontal scaling is easier later.', NOW() - INTERVAL 40 MINUTE),

-- Key decisions and recap
(21, 1, 'Alright, let me summarize what we discussed:', NOW() - INTERVAL 30 MINUTE),
(21, 1, '1. Backend: FastAPI with WebSockets\n2. Database: PostgreSQL with SQLAlchemy\n3. Auth: JWT tokens\n4. Caching: Redis\n5. Background tasks: Celery\n6. Frontend: React with TypeScript\n7. Testing: pytest\n8. Deployment: Docker + GitHub Actions', NOW() - INTERVAL 28 MINUTE),
(21, 2, 'Perfect summary! That''s a solid modern Python web stack.', NOW() - INTERVAL 26 MINUTE),
(21, 4, 'One more thing - use environment variables for configuration. Never hardcode secrets!', NOW() - INTERVAL 24 MINUTE),
(21, 1, 'Great advice! I''ll use python-dotenv for that.', NOW() - INTERVAL 22 MINUTE),
(21, 2, 'Good luck with your project! Feel free to ask if you hit any roadblocks.', NOW() - INTERVAL 20 MINUTE),
(21, 4, 'Yeah, we''re here to help. Happy coding!', NOW() - INTERVAL 18 MINUTE),
(21, 1, 'Thanks everyone! This discussion was super helpful.', NOW() - INTERVAL 16 MINUTE);
