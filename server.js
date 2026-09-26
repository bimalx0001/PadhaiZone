const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const Database=require("better-sqlite3");
const multer=require("multer");
const path=require("path"),fs=require("fs");

const app=express(), PORT=process.env.PORT||3000, ROOT=__dirname;
const uploadDir=path.join(ROOT,"uploads"); fs.mkdirSync(uploadDir,{recursive:true});
const db=new Database(path.join(ROOT,"padhaizone.db")); db.pragma("journal_mode=WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,level TEXT NOT NULL,subject TEXT NOT NULL,chapter TEXT NOT NULL,description TEXT DEFAULT '',file_name TEXT NOT NULL,file_path TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS pyqs(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,level TEXT NOT NULL,subject TEXT NOT NULL,year TEXT NOT NULL,file_name TEXT NOT NULL,file_path TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY AUTOINCREMENT,level TEXT NOT NULL,subject TEXT NOT NULL,chapter TEXT NOT NULL,question TEXT NOT NULL,answer TEXT DEFAULT '',type TEXT DEFAULT 'short');
CREATE TABLE IF NOT EXISTS bookmarks(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_type TEXT NOT NULL,item_id INTEGER NOT NULL,UNIQUE(user_id,item_type,item_id));
CREATE TABLE IF NOT EXISTS progress(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,note_id INTEGER NOT NULL,completed INTEGER DEFAULT 1,UNIQUE(user_id,note_id));
CREATE TABLE IF NOT EXISTS quiz_questions(id INTEGER PRIMARY KEY AUTOINCREMENT,question TEXT NOT NULL,option_a TEXT NOT NULL,option_b TEXT NOT NULL,option_c TEXT NOT NULL,option_d TEXT NOT NULL,answer TEXT NOT NULL,subject TEXT NOT NULL,level TEXT NOT NULL);
`);
const adminEmail=process.env.ADMIN_EMAIL||"admin@padhaizone.in", adminPassword=process.env.ADMIN_PASSWORD||"ChangeMe123!";
if(!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)){
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run("PadhaiZone Admin",adminEmail,bcrypt.hashSync(adminPassword,12));
  console.log("ADMIN:",adminEmail,"PASSWORD:",adminPassword);
}
const storage=multer.diskStorage({destination:uploadDir,filename:(r,f,cb)=>cb(null,Date.now()+"-"+f.originalname.replace(/[^a-zA-Z0-9._-]/g,"_"))});
const upload=multer({storage,limits:{fileSize:30*1024*1024},fileFilter:(r,f,cb)=>cb(/pdf|png|jpeg|webp/.test(f.mimetype)?null:new Error("PDF/JPG/PNG/WEBP only"))});
app.use(express.json()); app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||"change-this-secret",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:604800000}}));
app.use("/uploads",express.static(uploadDir)); app.use(express.static(path.join(ROOT,"public")));
const login=(req,res,next)=>req.session.user?next():res.status(401).json({error:"Login required"});
const admin=(req,res,next)=>req.session.user?.role==="admin"?next():res.status(403).json({error:"Admin only"});

app.get("/api/me",(q,s)=>s.json({user:q.session.user||null}));
app.post("/api/signup",async(q,s)=>{let{name,email,password}=q.body;email=(email||"").trim().toLowerCase();name=(name||"").trim();if(!name||!email||!password||password.length<8)return s.status(400).json({error:"Name, email and 8+ character password required"});if(db.prepare("select id from users where email=?").get(email))return s.status(409).json({error:"Email already registered"});let id=db.prepare("insert into users(name,email,password_hash) values(?,?,?)").run(name,email,await bcrypt.hash(password,12)).lastInsertRowid;q.session.user={id,name,email,role:"student"};s.json({user:q.session.user})});
app.post("/api/login",async(q,s)=>{let email=(q.body.email||"").trim().toLowerCase(),u=db.prepare("select * from users where email=?").get(email);if(!u||!(await bcrypt.compare(q.body.password||"",u.password_hash)))return s.status(401).json({error:"Invalid email or password"});q.session.user={id:u.id,name:u.name,email:u.email,role:u.role};s.json({user:q.session.user})});
app.post("/api/logout",(q,s)=>q.session.destroy(()=>s.json({ok:true})));

app.get("/api/notes",(q,s)=>{let{level,subject,chapter,q}=q.query,sql="select * from notes where 1=1",a=[];if(level){sql+=" and level=?";a.push(level)}if(subject){sql+=" and subject=?";a.push(subject)}if(chapter){sql+=" and chapter=?";a.push(chapter)}if(q){sql+=" and (title like ? or description like ? or chapter like ?)";let x="%"+q+"%";a.push(x,x,x)}s.json(db.prepare(sql+" order by id desc").all(...a))});
app.post("/api/notes",admin,upload.single("file"),(q,s)=>{if(!q.file)return s.status(400).json({error:"File required"});let{title,level,subject,chapter,description=""}=q.body;if(!title||!level||!subject||!chapter)return s.status(400).json({error:"All note fields required"});let id=db.prepare("insert into notes(title,level,subject,chapter,description,file_name,file_path) values(?,?,?,?,?,?,?)").run(title,level,subject,chapter,description,q.file.originalname,"/uploads/"+q.file.filename).lastInsertRowid;s.json({id})});
app.delete("/api/notes/:id",admin,(q,s)=>{let n=db.prepare("select * from notes where id=?").get(q.params.id);if(!n)return s.status(404).json({error:"Not found"});let p=path.join(ROOT,n.file_path.replace("/uploads/","uploads/"));if(fs.existsSync(p))fs.unlinkSync(p);db.prepare("delete from notes where id=?").run(q.params.id);s.json({ok:true})});

app.get("/api/pyqs",(q,s)=>s.json(db.prepare("select * from pyqs order by year desc,id desc").all()));
app.post("/api/pyqs",admin,upload.single("file"),(q,s)=>{if(!q.file)return s.status(400).json({error:"File required"});let{title,level,subject,year}=q.body;if(!title||!level||!subject||!year)return s.status(400).json({error:"All PYQ fields required"});let id=db.prepare("insert into pyqs(title,level,subject,year,file_name,file_path) values(?,?,?,?,?,?)").run(title,level,subject,year,q.file.originalname,"/uploads/"+q.file.filename).lastInsertRowid;s.json({id})});
app.delete("/api/pyqs/:id",admin,(q,s)=>{let p=db.prepare("select * from pyqs where id=?").get(q.params.id);if(p){let f=path.join(ROOT,p.file_path.replace("/uploads/","uploads/"));if(fs.existsSync(f))fs.unlinkSync(f);db.prepare("delete from pyqs where id=?").run(q.params.id)}s.json({ok:true})});

app.get("/api/questions",(q,s)=>{let{level,subject,chapter}=q.query,sql="select * from questions where 1=1",a=[];for(const [k,v] of [["level",level],["subject",subject],["chapter",chapter]])if(v){sql+=" and "+k+"=?";a.push(v)}s.json(db.prepare(sql+" order by id desc").all(...a))});
app.post("/api/questions",admin,(q,s)=>{let{level,subject,chapter,question,answer="",type="short"}=q.body;if(!level||!subject||!chapter||!question)return s.status(400).json({error:"Required fields missing"});s.json({id:db.prepare("insert into questions(level,subject,chapter,question,answer,type) values(?,?,?,?,?,?)").run(level,subject,chapter,question,answer,type).lastInsertRowid})});
app.delete("/api/questions/:id",admin,(q,s)=>{db.prepare("delete from questions where id=?").run(q.params.id);s.json({ok:true})});

app.get("/api/quiz",(q,s)=>s.json(db.prepare("select id,question,option_a,option_b,option_c,option_d,subject,level from quiz_questions order by random() limit 10").all()));
app.post("/api/quiz",admin,(q,s)=>{let x=q.body;if(!x.question||!x.option_a||!x.option_b||!x.option_c||!x.option_d||!x.answer||!x.subject||!x.level)return s.status(400).json({error:"All quiz fields required"});s.json({id:db.prepare("insert into quiz_questions(question,option_a,option_b,option_c,option_d,answer,subject,level) values(?,?,?,?,?,?,?,?)").run(x.question,x.option_a,x.option_b,x.option_c,x.option_d,x.answer,x.subject,x.level).lastInsertRowid})});

app.post("/api/bookmark",login,(q,s)=>{let{item_type,item_id}=q.body;db.prepare("insert or ignore into bookmarks(user_id,item_type,item_id) values(?,?,?)").run(q.session.user.id,item_type,item_id);s.json({ok:true})});
app.get("/api/bookmarks",login,(q,s)=>s.json(db.prepare("select * from bookmarks where user_id=? order by id desc").all(q.session.user.id)));
app.post("/api/progress/:noteId",login,(q,s)=>{db.prepare("insert into progress(user_id,note_id) values(?,?) on conflict(user_id,note_id) do update set completed=1").run(q.session.user.id,q.params.noteId);s.json({ok:true})});
app.get("/api/progress",login,(q,s)=>{let n=db.prepare("select count(*) c from progress where user_id=? and completed=1").get(q.session.user.id).c;s.json({completed:n})});
app.get("/api/admin/stats",admin,(q,s)=>s.json({users:db.prepare("select count(*) c from users where role='student'").get().c,notes:db.prepare("select count(*) c from notes").get().c,pyqs:db.prepare("select count(*) c from pyqs").get().c,questions:db.prepare("select count(*) c from questions").get().c}));
app.use((e,q,s,n)=>s.status(400).json({error:e.message||"Request failed"}));
app.listen(PORT,()=>console.log(`PadhaiZone: http://localhost:${PORT}`));
