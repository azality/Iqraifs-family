import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Users, Baby } from 'lucide-react';
import { motion } from 'motion/react';

export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-4">
      <div className="w-full max-w-4xl text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Family Growth System
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Building better habits, stronger values, and closer families through structured growth and accountability
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid md:grid-cols-2 gap-6 mt-12"
        >
          {/* Parent Login */}
          <Card className="hover:shadow-2xl transition-all cursor-pointer group" onClick={() => navigate('/login')}>
            <CardContent className="p-8 text-center space-y-4">
              <div className="bg-blue-100 group-hover:bg-blue-200 transition-colors w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                <Users className="h-10 w-10 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">I'm a Parent</h2>
              <p className="text-gray-600">
                Manage your family, track progress, and guide your children's growth
              </p>
              <Button className="w-full mt-4 h-12 text-lg" size="lg">
                Parent Login
              </Button>
            </CardContent>
          </Card>

          {/* Kid Login */}
          <Card className="hover:shadow-2xl transition-all cursor-pointer group" onClick={() => navigate('/kid-login-new')}>
            <CardContent className="p-8 text-center space-y-4">
              <div className="bg-gradient-to-br from-yellow-100 to-orange-100 group-hover:from-yellow-200 group-hover:to-orange-200 transition-all w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                <span className="text-5xl">👶</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">I'm a Kid</h2>
              <p className="text-gray-600">
                Check your progress, complete challenges, and earn rewards!
              </p>
              <Button 
                variant="outline" 
                className="w-full mt-4 h-12 text-lg border-2 border-yellow-400 hover:bg-yellow-50" 
                size="lg"
              >
                Kid Login
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-sm text-gray-500 mt-8"
        >
          <p>Built on principles of consistency, accountability, and Islamic values</p>
          <button 
            onClick={() => navigate('/debug-storage')}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Debug Storage
          </button>
        </motion.div>
      </div>
    </div>
  );
}