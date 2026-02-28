const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3ywizof.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const database = client.db('Task');
    const jobsCollection = database.collection('jobs');
    const applicationsCollection = database.collection('applications');

    // ─────────────────────────────────────────
    // JOBS ROUTES
    // ─────────────────────────────────────────

    // GET /api/jobs — List all jobs (with optional filters)
    app.get('/api/jobs', async (req, res) => {
      try {
        const { keyword, location, category, featured, limit, sort } = req.query;
        const query = {};

        if (keyword) {
          query.$or = [
            { title: { $regex: keyword, $options: 'i' } },
            { company: { $regex: keyword, $options: 'i' } },
            { description: { $regex: keyword, $options: 'i' } },
          ];
        }

        if (location) {
          query.location = { $regex: location, $options: 'i' };
        }

        if (category) {
          // Support both 'category' string and 'categories' array
          query['$or'] = query['$or'] || [];
          const catConds = [
            { category: { $regex: category, $options: 'i' } },
            { categories: { $elemMatch: { $regex: category, $options: 'i' } } },
          ];
          if (query['$or'].length) {
            query['$and'] = [{ '$or': query['$or'] }, { '$or': catConds }];
            delete query['$or'];
          } else {
            query['$or'] = catConds;
          }
        }

        if (featured === 'true') {
          query.featured = true;
        }

        const sortOption = sort === 'newest' ? { created_at: -1 } : { created_at: -1 };
        const limitNum = limit ? parseInt(limit) : 0;

        const jobs = await jobsCollection
          .find(query)
          .sort(sortOption)
          .limit(limitNum)
          .toArray();

        res.json({ jobs, total: jobs.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch jobs' });
      }
    });

    // GET /api/jobs/:id — Get single job
    app.get('/api/jobs/:id', async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: 'Invalid job ID' });
        }

        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });

        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        res.json(job);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch job' });
      }
    });

    // POST /api/jobs — Create a job (Admin)
    app.post('/api/jobs', async (req, res) => {
      try {
        const { title, company, location, category, description, type, featured, logo } = req.body;

        // Validation
        const missing = [];
        if (!title?.trim()) missing.push('title');
        if (!company?.trim()) missing.push('company');
        if (!location?.trim()) missing.push('location');
        if (!category?.trim()) missing.push('category');
        if (!description?.trim()) missing.push('description');

        if (missing.length) {
          return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
        }

        const newJob = {
          title: title.trim(),
          company: company.trim(),
          location: location.trim(),
          category: category.trim(),
          description: description.trim(),
          type: type || 'Full Time',
          featured: featured || false,
          logo: logo || null,
          created_at: new Date(),
        };

        const result = await jobsCollection.insertOne(newJob);
        res.status(201).json({ message: 'Job created successfully', jobId: result.insertedId, job: newJob });
      } catch (err) {
        res.status(500).json({ error: 'Failed to create job' });
      }
    });

    // DELETE /api/jobs/:id — Delete a job (Admin)
    app.delete('/api/jobs/:id', async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: 'Invalid job ID' });
        }

        const result = await jobsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Job not found' });
        }

        res.json({ message: 'Job deleted successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete job' });
      }
    });

    // ─────────────────────────────────────────
    // APPLICATIONS ROUTES
    // ─────────────────────────────────────────

    // POST /api/applications — Submit a job application
    app.post('/api/applications', async (req, res) => {
      try {
        const { job_id, name, email, resume_link, cover_note } = req.body;

        // Validation
        if (!job_id || !name?.trim() || !email?.trim() || !resume_link?.trim() || !cover_note?.trim()) {
          return res.status(400).json({ error: 'All fields are required' });
        }

        // Email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }

        // URL format
        try {
          new URL(resume_link);
        } catch {
          return res.status(400).json({ error: 'Resume link must be a valid URL' });
        }

        // Check job exists
        if (!ObjectId.isValid(job_id)) {
          return res.status(400).json({ error: 'Invalid job ID' });
        }

        const job = await jobsCollection.findOne({ _id: new ObjectId(job_id) });
        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        const application = {
          job_id: new ObjectId(job_id),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          resume_link: resume_link.trim(),
          cover_note: cover_note.trim(),
          created_at: new Date(),
        };

        const result = await applicationsCollection.insertOne(application);
        res.status(201).json({ message: 'Application submitted successfully', applicationId: result.insertedId });
      } catch (err) {
        res.status(500).json({ error: 'Failed to submit application' });
      }
    });

    // GET /api/applications — Get all applications (Admin)
    app.get('/api/applications', async (req, res) => {
      try {
        const applications = await applicationsCollection
          .find()
          .sort({ created_at: -1 })
          .toArray();

        res.json({ applications, total: applications.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch applications' });
      }
    });

    // GET /api/applications/:jobId — Get applications for a specific job (Admin)
    app.get('/api/applications/:jobId', async (req, res) => {
      try {
        const { jobId } = req.params;

        if (!ObjectId.isValid(jobId)) {
          return res.status(400).json({ error: 'Invalid job ID' });
        }

        const applications = await applicationsCollection
          .find({ job_id: new ObjectId(jobId) })
          .sort({ created_at: -1 })
          .toArray();

        res.json({ applications, total: applications.length });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch applications' });
      }
    });

    // ─────────────────────────────────────────
    // SEED ROUTE (dev only) — POST /api/seed
    // Hit this once to populate your DB with sample data
    // ─────────────────────────────────────────
    app.post('/api/seed', async (req, res) => {
      try {
        await jobsCollection.deleteMany({});

        // Logo URLs — using Clearbit logo API (free, no key needed)
        // Format: https://logo.clearbit.com/domain.com
        const logos = {
          revolut:   'https://logo.clearbit.com/revolut.com',
          dropbox:   'https://logo.clearbit.com/dropbox.com',
          pitch:     'https://logo.clearbit.com/pitch.com',
          blendd:    null, // no public logo, will show initial
          cloudpass: null,
          canva:     'https://logo.clearbit.com/canva.com',
          godaddy:   'https://logo.clearbit.com/godaddy.com',
          twitter:   'https://logo.clearbit.com/twitter.com',
          nomad:     'https://logo.clearbit.com/nomad.com',
          netlify:   'https://logo.clearbit.com/netlify.com',
          terraform: 'https://logo.clearbit.com/terraform.io',
          packer:    'https://logo.clearbit.com/hashicorp.com',
          maze:      'https://logo.clearbit.com/maze.co',
          udacity:   'https://logo.clearbit.com/udacity.com',
          webflow:   'https://logo.clearbit.com/webflow.com',
        };

        const sampleJobs = [
          // ── FEATURED JOBS (8) — shown in "Featured Jobs" grid ──
          {
            title: "Email Marketing",
            company: "Revolut",
            location: "Madrid, Spain",
            categories: ["Marketing"],
            type: "Full Time",
            description: "Revolut is looking for an Email Marketing specialist to help teams build and optimise email campaigns that drive customer engagement and retention across Europe.",
            featured: true,
            logo: logos.revolut,
            created_at: new Date(Date.now() - 0 * 60 * 60 * 1000),
          },
          {
            title: "Brand Designer",
            company: "Dropbox",
            location: "San Francisco, US",
            categories: ["Design", "Business"],
            type: "Full Time",
            description: "Dropbox is looking for a Brand Designer to help the team create beautiful and consistent design systems across all brand touchpoints.",
            featured: true,
            logo: logos.dropbox,
            created_at: new Date(Date.now() - 1 * 60 * 60 * 1000),
          },
          {
            title: "Email Marketing",
            company: "Pitch",
            location: "Berlin, Germany",
            categories: ["Marketing"],
            type: "Full Time",
            description: "Pitch is looking for a Customer Manager to join the marketing team and drive impactful campaigns across digital channels.",
            featured: true,
            logo: logos.pitch,
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          {
            title: "Visual Designer",
            company: "Blendd",
            location: "Granada, Spain",
            categories: ["Design"],
            type: "Full Time",
            description: "Blendd is looking for a Visual Designer to help teams design stunning brand identities and digital experiences.",
            featured: true,
            logo: logos.blendd,
            created_at: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
          {
            title: "Product Designer",
            company: "Cloudpass",
            location: "Manchester, UK",
            categories: ["Marketing", "Design"],
            type: "Full Time",
            description: "Cloudpass is looking for a Product Designer to help build the next generation of cloud security tools with intuitive, user-first design.",
            featured: true,
            logo: logos.cloudpass,
            created_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
          },
          {
            title: "Lead Designer",
            company: "Canva",
            location: "Ontario, Canada",
            categories: ["Design", "Business"],
            type: "Full Time",
            description: "Canva is looking for a Lead Designer to develop and ship new design features across our creative platform used by millions worldwide.",
            featured: true,
            logo: logos.canva,
            created_at: new Date(Date.now() - 5 * 60 * 60 * 1000),
          },
          {
            title: "Brand Strategist",
            company: "GoDaddy",
            location: "Marseille, France",
            categories: ["Marketing"],
            type: "Full Time",
            description: "GoDaddy is looking for a Brand Strategist to join the team and shape the voice, positioning, and identity of our global brand.",
            featured: true,
            logo: logos.godaddy,
            created_at: new Date(Date.now() - 6 * 60 * 60 * 1000),
          },
          {
            title: "Data Analyst",
            company: "Twitter",
            location: "San Diego, US",
            categories: ["Technology"],
            type: "Full Time",
            description: "Twitter is looking for a Data Analyst to help teams derive actionable insights from complex datasets and shape product decisions.",
            featured: true,
            logo: logos.twitter,
            created_at: new Date(Date.now() - 7 * 60 * 60 * 1000),
          },

          // ── LATEST JOBS (8) — shown in "Latest Jobs Open" list ──
          {
            title: "Social Media Assistant",
            company: "Nomad",
            location: "Paris, France",
            categories: ["Marketing", "Design"],
            type: "Full Time",
            description: "Nomad is looking for a Social Media Assistant to manage and grow our online presence across Instagram, LinkedIn, and Twitter.",
            featured: false,
            logo: logos.nomad,
            created_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          },
          {
            title: "Social Media Assistant",
            company: "Netlify",
            location: "Paris, France",
            categories: ["Marketing", "Design"],
            type: "Full Time",
            description: "Netlify is looking for a Social Media Assistant to grow brand awareness and manage community engagement across all platforms.",
            featured: false,
            logo: logos.netlify,
            created_at: new Date(Date.now() - 9 * 60 * 60 * 1000),
          },
          {
            title: "Brand Designer",
            company: "Dropbox",
            location: "San Fransisco, USA",
            categories: ["Marketing", "Design"],
            type: "Full Time",
            description: "Dropbox is looking for a Brand Designer to craft compelling visual assets across all brand channels and campaigns.",
            featured: false,
            logo: logos.dropbox,
            created_at: new Date(Date.now() - 10 * 60 * 60 * 1000),
          },
          {
            title: "Brand Designer",
            company: "Maze",
            location: "San Fransisco, USA",
            categories: ["Marketing", "Design"],
            type: "Full Time",
            description: "Maze is looking for a Brand Designer to create stunning visual systems for our product and marketing materials.",
            featured: false,
            logo: logos.maze,
            created_at: new Date(Date.now() - 11 * 60 * 60 * 1000),
          },
          {
            title: "Interactive Developer",
            company: "Terraform",
            location: "Hamburg, Germany",
            categories: ["Marketing", "Design"],
            type: "Full Time",
            description: "Terraform is looking for an Interactive Developer to build immersive, high-performance web experiences for our platform.",
            featured: false,
            logo: logos.terraform,
            created_at: new Date(Date.now() - 12 * 60 * 60 * 1000),
          },
          {
            title: "Interactive Developer",
            company: "Udacity",
            location: "Hamburg, Germany",
            categories: ["Marketing", "Design"],
            type: "Full Time",
            description: "Udacity is looking for an Interactive Developer to build next-gen interactive learning experiences for our global student base.",
            featured: false,
            logo: logos.udacity,
            created_at: new Date(Date.now() - 13 * 60 * 60 * 1000),
          },
          {
            title: "HR Manager",
            company: "Packer",
            location: "Lucern, Switzerland",
            categories: ["Marketing", "Management"],
            type: "Full Time",
            description: "Packer is looking for an HR Manager to lead recruitment, onboarding, and employee engagement initiatives across the organisation.",
            featured: false,
            logo: logos.packer,
            created_at: new Date(Date.now() - 14 * 60 * 60 * 1000),
          },
          {
            title: "HR Manager",
            company: "Webflow",
            location: "Lucern, Switzerland",
            categories: ["Marketing", "Management"],
            type: "Full Time",
            description: "Webflow is looking for an HR Manager to scale our people operations and build a world-class team globally.",
            featured: false,
            logo: logos.webflow,
            created_at: new Date(Date.now() - 15 * 60 * 60 * 1000),
          },
        ];

        await jobsCollection.insertMany(sampleJobs);
        res.json({ message: `Seeded ${sampleJobs.length} jobs successfully` });
      } catch (err) {
        res.status(500).json({ error: 'Seeding failed', details: err.message });
      }
    });

  } finally {
    // keep connection open
  }
}

run().catch(console.log);

// Root
app.get('/', (req, res) => {
  res.send('QuickHire Server is Running');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
